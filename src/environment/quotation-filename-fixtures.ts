import type {
  ILegacyFilenameSeed,
  IFilenameSnapshotRow,
  IStoredFilenameSnapshot,
} from "../interfaces/quotation-filename.interface.ts";

import {
  PUBLICATION_KIND,
  PUBLICATION_STATE,
} from "../constants/quotation-publication.constant.ts";

import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { isRecord } from "../utilities/guard.utility.ts";
import { QUOTATION } from "../constants/quotation.constant.ts";
import { PERMISSIONS } from "../constants/permission.constant.ts";
import { createTestDatabaseClient } from "./test-database-client.ts";
import { APP_DIRECTORIES } from "../constants/environment.constant.ts";
import type { PublicationRoleType } from "../constants/quotation-publication.constant.ts";

export const filenameSnapshot = async (id: string): Promise<IStoredFilenameSnapshot> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<IFilenameSnapshotRow>(
      `SELECT o.snapshot,o.source_hash AS "sourceHash",c.project_id AS "projectId",
       c.root_id AS "rootId",c.root_context AS "rootContext",o.source_version AS "sourceVersion"
       FROM quotation_publication_operations o JOIN quotation_publication_cycles c ON c.id=o.cycle_id
       WHERE c.quotation_id=$1 AND o.kind IS NOT NULL ORDER BY c.updated_at DESC,o.generation DESC LIMIT 1`,
      [id],
    );
    const row = result.rows[0];
    if (!row || !isRecord(row.snapshot) || !isRecord(row.rootContext)) {
      throw new Error("Missing persisted filename snapshot");
    }

    return { ...row, snapshot: row.snapshot, rootContext: row.rootContext };
  } finally {
    await database.end();
  }
};

const snapshotHash = async (snapshot: Record<string, unknown>): Promise<string> => {
  const location = pathToFileURL(
    join(
      APP_DIRECTORIES.BACKEND,
      "dist/modules/quotation-publication/utilities/publication-hash.utility.js",
    ),
  );
  const protocol: unknown = await import(location.href);
  if (!isRecord(protocol) || typeof protocol.publicationSnapshotHash !== "function") {
    throw new Error("Reviewed publication hash protocol is unavailable");
  }

  const hash: unknown = protocol.publicationSnapshotHash(snapshot);
  const isDigest = typeof hash === "string" && /^[a-f0-9]{64}$/u.test(hash);
  if (!isDigest) {
    throw new Error("Invalid publication fixture hash");
  }

  return hash;
};

export const seedLegacyFilenameRetry = async ({
  id,
  stored,
  historicalFilename,
  projectCode,
}: ILegacyFilenameSeed): Promise<{ cycleId: string; generation: number; sourceHash: string }> => {
  const document = stored.snapshot.document;
  const source = stored.snapshot.source;
  if (!isRecord(document) || !isRecord(source)) {
    throw new Error("Invalid legacy source document");
  }

  const metadata = document.metadata;
  const recipient = document.recipient;
  if (!isRecord(metadata) || !isRecord(recipient)) {
    throw new Error("Invalid legacy rendered context");
  }

  const cycleId = randomUUID();
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("BEGIN");
    const current = await database.query<{ version: number }>(
      "SELECT version FROM quotations WHERE id=$1 FOR UPDATE",
      [id],
    );
    const saved = current.rows[0];
    if (!saved) {
      throw new Error("Legacy quotation fixture is missing");
    }

    const version = saved.version + 1;
    const snapshot = {
      ...stored.snapshot,
      source: { ...source, version, status: QUOTATION.STATUS.REVIEW },
      document: { ...document, metadata: { ...metadata, revision: version } },
      filename: historicalFilename,
      filenamePolicy: "quotation-filename.v1",
      namingInputs: {
        title: document.title,
        number: document.number,
        customerName: recipient.name,
        projectCode,
        apartmentNumber: null,
        brands: source.brands,
      },
    };
    const sourceHash = await snapshotHash(snapshot);
    await database.query("UPDATE quotations SET status=$1,version=$2 WHERE id=$3", [
      QUOTATION.STATUS.REVIEW,
      version,
      id,
    ]);
    await database.query(
      `INSERT INTO quotation_publication_cycles(id,quotation_id,project_id,root_id,root_context,generation,desired_kind,source_version,state,reason)
       VALUES($1,$2,$3,$4,$5,1,$6,$7,$8,$9)`,
      [
        cycleId,
        id,
        stored.projectId,
        stored.rootId,
        stored.rootContext,
        PUBLICATION_KIND.QUOTATION,
        version,
        PUBLICATION_STATE.FAILED,
        "Legacy render failed",
      ],
    );
    await database.query(
      `INSERT INTO quotation_publication_operations(id,cycle_id,generation,kind,source_version,retry_permission,source_hash,snapshot,state,job_id,reason)
       VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        randomUUID(),
        cycleId,
        PUBLICATION_KIND.QUOTATION,
        version,
        PERMISSIONS.QUOTATIONS_UPDATE,
        sourceHash,
        snapshot,
        PUBLICATION_STATE.FAILED,
        randomUUID(),
        "Legacy render failed",
      ],
    );
    await database.query("COMMIT");
    return { cycleId, generation: 1, sourceHash };
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    await database.end();
  }
};

export const renameFilenameParties = async (
  customerId: string,
  projectId: string,
): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE customers SET name=$1 WHERE id=$2", [
      "לקוח לאחר צילום",
      customerId,
    ]);
    await database.query("UPDATE projects SET name=$1 WHERE id=$2", [
      `פרויקט לאחר צילום ${projectId}`,
      projectId,
    ]);
  } finally {
    await database.end();
  }
};

export const publicationRoleFolder = async (
  id: string,
  role: PublicationRoleType,
): Promise<string> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<{ folderId: string }>(
      `SELECT f.folder_id AS "folderId" FROM quotation_publication_cycles c
       JOIN quotation_publication_folders f ON f.project_id=c.project_id AND f.root_id=c.root_id
       WHERE c.quotation_id=$1 AND f.role=$2 AND f.confirmed ORDER BY c.source_version DESC LIMIT 1`,
      [id, role],
    );
    const folder = result.rows[0];
    if (!folder) {
      throw new Error(`Missing confirmed publication folder ${role}`);
    }

    return folder.folderId;
  } finally {
    await database.end();
  }
};
