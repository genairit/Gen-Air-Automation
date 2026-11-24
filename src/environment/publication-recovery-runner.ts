import { once } from "node:events";
import type { Server } from "node:http";
import { request } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { OwnedResources } from "./owned-resources.ts";
import type EmbeddedPostgres from "embedded-postgres";
import type { ChildProcess } from "node:child_process";
import { TIME_UNITS } from "../constants/time.constant.ts";
import { waitForProcessReady } from "./process-readiness.ts";
import { stopChildProcess, stopChildProcesses } from "./stop-child-process.ts";
import type { IOwnedBrokerProxy } from "../interfaces/owned-process.interface.ts";
import { startLocalBrokerProxy, reserveLoopbackPort } from "./local-broker-proxy.ts";
import type { PublicationQueueSuffixType } from "../constants/quotation-publication.constant.ts";

interface IRecoveryProcesses {
  worker: ChildProcess | null;
  backend: ChildProcess | null;
  proxy: IOwnedBrokerProxy | null;
}
interface IRecoveryResources {
  places: Server | null;
  database: EmbeddedPostgres | null;
}

process.env.GEN_AIR_PDF_QA = "true";
process.env.GEN_AIR_EMAIL_QA = "true";
process.env.GEN_AIR_QA_SETUP_ROLES = "system_admin,engineer,secretary";
const logPath = process.env.GEN_AIR_RECOVERY_LOG_PATH;
assert.ok(logPath, "Recovery runner requires a private process log");
const readLog = (): Promise<string> => readFile(logPath, "utf8");
const upstream = new URL(
  process.env.GEN_AIR_TEST_RABBITMQ_URL ?? "amqp://quotation_test:quotation_test@127.0.0.1:5678",
);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname));
assert.equal(upstream.port, "5678", "Recovery requires the dedicated disposable broker port");
assert.equal(upstream.username, "quotation_test");
assert.equal(upstream.password, "quotation_test");
const cancellation = new AbortController();
const cancel = (): void => cancellation.abort(new Error("Recovery runner interrupted"));
process.once("SIGTERM", cancel);
process.once("SIGINT", cancel);
const proxyPort = await reserveLoopbackPort();
const proxyUrl = new URL(upstream);
proxyUrl.hostname = "127.0.0.1";
proxyUrl.port = String(proxyPort);
process.env.GEN_AIR_TEST_RABBITMQ_URL = proxyUrl.href;

const { URLS, PORTS, PUBLICATION_BROKER, AUTOMATION_DIRECTORIES } =
  await import("../constants/environment.constant.ts");
const { startTestDatabase, stopTestDatabase } = await import("./test-database.ts");
const { startBackend } = await import("./backend-process.ts");
const { startPdfWorkerServer } = await import("./pdf-worker-server.ts");
const { startFakePlacesServer } = await import("./fake-places-server.ts");
const { createTestDatabaseClient } = await import("./test-database-client.ts");
const { seedQuotationDesign } = await import("../api/quotation-design-fixture.ts");
const { createGenAirApi, loginThroughApi } = await import("../api/gen-air-api.ts");
const { TEST_USERS } = await import("../constants/test-users.constant.ts");
const { USER_ROLES } = await import("../constants/user-role.constant.ts");
const { PUBLICATION_STATE, PUBLICATION_EFFECT, PUBLICATION_QUEUE_SUFFIX } =
  await import("../constants/quotation-publication.constant.ts");
const { QUOTATION } = await import("../constants/quotation.constant.ts");
const { HTTP_METHODS } = await import("../constants/http.constant.ts");
const { quotationDocument } = await import("../api/quotation.api.ts");
const { readPublication } = await import("../api/quotation-publication.api.ts");
const { publicationEffects, publicationBytes } = await import("./publication-fixtures.ts");
const { legacyDriveTree, legacyDriveItem, registerLegacyDriveItems } =
  await import("./existing-drive-fixtures.ts");
const { createHash } = await import("node:crypto");

const until = async (check: () => Promise<boolean>, label: string): Promise<void> => {
  const deadline = Date.now() + TIME_UNITS.MINUTE_MS;
  for (const _ of Array.from({ length: 120 })) {
    cancellation.signal.throwIfAborted();
    if (await check()) {
      return;
    }

    if (Date.now() >= deadline) {
      break;
    }
    await new Promise((resolve): NodeJS.Timeout => setTimeout(resolve, TIME_UNITS.SECOND_MS / 2));
  }
  throw new Error(`Recovery check did not complete: ${label}`);
};
const management = process.env.GEN_AIR_TEST_RABBITMQ_MANAGEMENT_URL ?? "http://127.0.0.1:15678";
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(management).hostname)) {
  throw new Error("Recovery metrics require loopback RabbitMQ management");
}

const queueStats = async (suffix: PublicationQueueSuffixType): Promise<Record<string, unknown>> => {
  const response = await fetch(
    `${management}/api/queues/%2F/${encodeURIComponent(`${PUBLICATION_BROKER.PREFIX}.pdf.${suffix}`)}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`).toString("base64")}`,
      },
    },
  );
  assert.equal(response.status, 200, "Local broker queue metrics unavailable");
  const value: unknown = await response.json();
  assert.ok(value !== null && typeof value === "object");
  if (!("message_stats" in value)) {
    return {};
  }

  const stats = value.message_stats;
  assert.ok(stats !== null && typeof stats === "object");
  return {
    ...Object.fromEntries(Object.entries(stats)),
    queueMessages: "messages" in value ? value.messages : null,
  };
};
const owned: IRecoveryProcesses = { backend: null, worker: null, proxy: null };
const resources: IRecoveryResources = { database: null, places: null };
const client = createTestDatabaseClient();
const http = await request.newContext({ baseURL: URLS.BACKEND });
try {
  resources.database = await startTestDatabase();
  resources.places = await startFakePlacesServer(PORTS.FAKE_PLACES);
  await client.connect();
  owned.backend = await startBackend();
  await waitForProcessReady({
    child: owned.backend,
    url: URLS.BACKEND,
    label: "first Backend ready",
    signal: cancellation.signal,
  });
  const session = await loginThroughApi(http, TEST_USERS[USER_ROLES.SYSTEM_ADMIN]);
  const api = createGenAirApi(http, session);
  const fixture = await seedQuotationDesign(api);
  const root = await legacyDriveTree("Recovery fixture project");
  await registerLegacyDriveItems([
    legacyDriveItem("הזמנה לביצוע", root.root.id),
    legacyDriveItem("ארכיון הצעות מחיר", root.root.id),
  ]);
  assert.equal(
    (await api.send(HTTP_METHODS.POST, `/project-drive/${fixture.project.id}/provision`)).ok(),
    true,
  );
  await client.query(
    "UPDATE projects SET drive_folder_id=$1,drive_folder_linked=true WHERE id=$2",
    [root.root.id, fixture.project.id],
  );
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${fixture.quotation.id}/review`, {
      version: fixture.quotation.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const committedLogLength = (await readLog()).length;
  await until(
    async (): Promise<boolean> =>
      (await readLog())
        .slice(committedLogLength)
        .includes("Publication broker unavailable; durable intent remains pending"),
    "offline dispatcher tick after business commit",
  );
  const initial = await client.query<{ state: string; hash: string | null }>(
    "SELECT o.state,o.hash FROM quotation_publication_operations o JOIN quotation_publication_cycles c ON c.id=o.cycle_id WHERE c.quotation_id=$1",
    [review.id],
  );
  assert.equal(initial.rows.length, 1);
  assert.equal(initial.rows[0].hash, null);
  assert.equal(initial.rows[0].state, PUBLICATION_STATE.QUEUED);
  assert.equal(
    (await publicationEffects()).filter((effect): boolean => effect.mimeType === "application/pdf")
      .length,
    0,
  );
  await stopChildProcess(owned.backend);
  owned.backend = await startBackend();
  await waitForProcessReady({
    child: owned.backend,
    url: URLS.BACKEND,
    label: "restarted Backend ready while broker offline",
    signal: cancellation.signal,
  });
  assert.equal((await readPublication(api, review.id)).cycleId !== null, true);
  await client.query(`CREATE SEQUENCE qa_publication_adoption_attempt;
    CREATE FUNCTION qa_fail_first_publication_adoption() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF OLD.hash IS NULL AND NEW.hash IS NOT NULL THEN
        IF nextval('qa_publication_adoption_attempt')=1 THEN RAISE EXCEPTION 'Disposable QA first adoption failure'; END IF;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER qa_publication_adoption_failure BEFORE UPDATE ON quotation_publication_operations
    FOR EACH ROW EXECUTE FUNCTION qa_fail_first_publication_adoption();`);
  owned.proxy = await startLocalBrokerProxy(proxyPort, upstream);
  owned.worker = await startPdfWorkerServer();
  await until(
    async (): Promise<boolean> =>
      (await readPublication(api, review.id)).state === PUBLICATION_STATE.PUBLISHED,
    "outage/restart publication recovery",
  );
  const sequence = await client.query<{ last_value: string }>(
    "SELECT last_value FROM qa_publication_adoption_attempt",
  );
  assert.equal(
    Number(sequence.rows[0].last_value),
    2,
    "First adoption must fail and the next delivery adopt",
  );
  const files = (await publicationEffects()).filter(
    (effect): boolean =>
      effect.action === PUBLICATION_EFFECT.CREATE && effect.mimeType === "application/pdf",
  );
  assert.equal(files.length, 1);
  const bytes = await publicationBytes(files[0]);
  const adopted = await client.query<{
    hash: string;
    revision_id: string | null;
    pdf: Buffer | null;
    attempt: number;
  }>(
    "SELECT o.hash,o.revision_id,o.pdf,o.attempt FROM quotation_publication_operations o JOIN quotation_publication_cycles c ON c.id=o.cycle_id WHERE c.quotation_id=$1",
    [review.id],
  );
  assert.equal(adopted.rows[0].hash, createHash("sha256").update(bytes).digest("hex"));
  assert.notEqual(adopted.rows[0].revision_id, null);
  assert.equal(adopted.rows[0].pdf, null);
  assert.ok(
    (await readLog()).includes("PDF result not adopted; broker delivery retained for recovery"),
    "Injected first adoption failure must be observed",
  );
  await until(async (): Promise<boolean> => {
    const result = await queueStats(PUBLICATION_QUEUE_SUFFIX.RESULTS);
    const job = await queueStats(PUBLICATION_QUEUE_SUFFIX.JOBS);
    return (
      Number(result.redeliver ?? 0) >= 1 &&
      Number(result.deliver_get ?? 0) >= 2 &&
      Number(job.deliver_get ?? 0) >= 1
    );
  }, "real result redelivery metric");
  const resultStats = await queueStats(PUBLICATION_QUEUE_SUFFIX.RESULTS);
  const jobStats = await queueStats(PUBLICATION_QUEUE_SUFFIX.JOBS);
  assert.equal(Number(jobStats.deliver_get), 1, "Only one render delivery is allowed");
  assert.equal(
    Number(resultStats.deliver_get),
    2,
    "Exactly one initial and one redelivered result",
  );
  await until(
    async (): Promise<boolean> =>
      (await queueStats(PUBLICATION_QUEUE_SUFFIX.RESULTS)).queueMessages === 0,
    "result queue drained metric",
  );
  const resultQueue = await fetch(
    `${management}/api/queues/%2F/${encodeURIComponent(`${PUBLICATION_BROKER.PREFIX}.pdf.${PUBLICATION_QUEUE_SUFFIX.RESULTS}`)}`,
    {
      headers: {
        authorization: `Basic ${Buffer.from(`${decodeURIComponent(upstream.username)}:${decodeURIComponent(upstream.password)}`).toString("base64")}`,
      },
    },
  );
  const queue: unknown = await resultQueue.json();
  assert.ok(queue !== null && typeof queue === "object" && "messages" in queue);
  assert.equal(queue.messages, 0);
  console.log(
    JSON.stringify({
      publicationRecovery: "passed",
      businessCommitWhileOffline: true,
      backendRestart: true,
      offlineDispatcherObserved: true,
      adoptionFailureObserved: true,
      adoptionAttempts: 2,
      resultRedeliveries: Number(resultStats.redeliver),
      renderDeliveries: Number(jobStats.deliver_get),
      fileCreates: 1,
      acceptedHashVerified: true,
      acceptedSha256: adopted.rows[0].hash,
      acceptedByteLength: bytes.length,
      resultDeliveries: Number(resultStats.deliver_get),
      resultQueueMessages: queue.messages,
    }),
  );
} finally {
  const cleanup = new OwnedResources();
  cleanup.own({
    name: "PostgreSQL",
    stop: async (): Promise<void> => {
      if (resources.database !== null) {
        await stopTestDatabase(resources.database);
        return;
      }

      const [result] = await Promise.allSettled([
        readFile(`${AUTOMATION_DIRECTORIES.DATABASE}/postmaster.pid`, "utf8"),
      ]);
      if (result.status === "rejected") {
        return;
      }

      const pid = Number(result.value.split("\n")[0]);
      assert.ok(Number.isSafeInteger(pid) && pid > 1, "Invalid owned PostgreSQL PID");
      process.kill(pid, "SIGTERM");
    },
  });
  cleanup.own({ name: "database client", stop: (): Promise<void> => client.end() });
  cleanup.own({ name: "HTTP client", stop: (): Promise<void> => http.dispose() });
  cleanup.own({
    name: "Places",
    stop: async (): Promise<void> => {
      if (resources.places === null) {
        return;
      }

      await new Promise<void>((resolve, reject): Server | void =>
        resources.places?.close((error): void => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }),
      );
    },
  });
  cleanup.own({
    name: "broker proxy",
    stop: async (): Promise<void> => {
      if (owned.proxy === null) {
        return;
      }

      const closed = once(owned.proxy, "close");
      owned.proxy.destroyConnections();
      owned.proxy.close();
      await closed;
    },
  });
  cleanup.own({
    name: "application processes",
    stop: (): Promise<void> => stopChildProcesses([owned.backend, owned.worker]),
  });
  try {
    await cleanup.stop();
  } finally {
    process.removeListener("SIGTERM", cancel);
    process.removeListener("SIGINT", cancel);
  }
}
