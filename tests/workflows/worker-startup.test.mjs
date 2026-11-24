import test from "node:test";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { TIME_UNITS } from "../../src/constants/time.constant.ts";
import { OwnedResources } from "../../src/environment/owned-resources.ts";
import { stopChildProcess } from "../../src/environment/stop-child-process.ts";
import { readinessStatus, waitForProcessReady } from "../../src/environment/process-readiness.ts";

const harness = new URL("../../src/environment/pdf-worker-server.ts", import.meta.url).href;
const stopper = new URL("../../src/environment/stop-child-process.ts", import.meta.url).href;
const freePort = async () => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
};
const fixture = async (code, check) => {
  const root = await mkdtemp(join(tmpdir(), "186-worker-start-"));
  const worker = join(root, "candidate");
  try {
    await Promise.all(
      ["assets", "node_modules", "dist"].map(name =>
        mkdir(join(worker, name), { recursive: true }),
      ),
    );
    await writeFile(join(worker, "dist/main.js"), code);
    const artifacts = join(root, "artifacts");
    await mkdir(join(artifacts, "fixtures"), { recursive: true });
    await writeFile(join(artifacts, "fixtures", "worker-runtime"), "conflicting old runtime entry");
    const child = spawn(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import assert from 'node:assert/strict';import {startPdfWorkerServer} from ${JSON.stringify(harness)};import {stopChildProcess} from ${JSON.stringify(stopper)};${check}`,
      ],
      {
        env: {
          ...process.env,
          GEN_AIR_WORKER_DIR: worker,
          GEN_AIR_WORKER_PREBUILT: "1",
          GEN_AIR_ARTIFACTS_DIR: artifacts,
          GEN_AIR_PDF_WORKER_PORT: String(await freePort()),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const output = [];
    child.stdout.on("data", value => output.push(String(value)));
    child.stderr.on("data", value => output.push(String(value)));
    const [exit] = await once(child, "exit");
    assert.equal(exit, 0, output.join(""));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
const genuine = `const http=require('node:http');http.createServer((req,res)=>{if(req.url==='/health/ready'){res.end('ready');return;}res.statusCode=req.headers.authorization==='Bearer '+process.env.WORKER_API_TOKEN?400:401;res.end();}).listen(Number(process.env.PORT),'127.0.0.1');`;

test("fresh Worker runtime supports repeated starts despite conflicting stable-root entry", async () => {
  await fixture(
    genuine,
    `const first=await startPdfWorkerServer();await stopChildProcess(first);const second=await startPdfWorkerServer();await stopChildProcess(second);`,
  );
});
test("occupied unrelated HTTP200 endpoint cannot establish candidate readiness", async () => {
  await fixture(
    `setInterval(()=>{},${TIME_UNITS.MINUTE_MS})`,
    `const {createServer}=await import('node:http');const {once}=await import('node:events');const foreign=createServer((req,res)=>res.end('foreign'));foreign.listen(Number(process.env.GEN_AIR_PDF_WORKER_PORT),'127.0.0.1');await once(foreign,'listening');try{await assert.rejects(startPdfWorkerServer(),{code:'EADDRINUSE'});}finally{await new Promise(resolve=>foreign.close(resolve));}`,
  );
});
test("startup exit is rejected and wrong runtime authentication is rejected with owned child stopped", async () => {
  await fixture(
    "process.exit(7)",
    `await assert.rejects(startPdfWorkerServer(),/exited (before|during) readiness/);`,
  );
  await fixture(
    genuine.replace("?400:401", "?400:400"),
    `await assert.rejects(startPdfWorkerServer(),/authentication proof failed/);`,
  );
});
test("partial ownership cleanup continues after a child-drain failure and startup cancellation is early", async () => {
  const resources = new OwnedResources();
  const stopped = [];
  resources.own({
    name: "database",
    stop: async () => {
      stopped.push("database");
    },
  });
  resources.own({
    name: "failed child",
    stop: async () => {
      stopped.push("child");
      throw new Error("drain failed");
    },
  });
  resources.cancel();
  assert.throws(() => resources.signal.throwIfAborted(), /cancelled/);
  await assert.rejects(resources.stop(), AggregateError);
  assert.deepEqual(stopped, ["child", "database"]);
  await resources.stop();
});
test("bounded readiness aborts hanging requests and unexpected errors remain failures", async () => {
  assert.equal(await readinessStatus(`http://127.0.0.1:${await freePort()}`), null);
  await assert.rejects(readinessStatus("not a URL"), /Unexpected readiness request failure/);
  const hanging = createHttpServer(() => {});
  hanging.listen(0, "127.0.0.1");
  await once(hanging, "listening");
  try {
    assert.equal(await readinessStatus(`http://127.0.0.1:${hanging.address().port}`), null);
  } finally {
    hanging.closeAllConnections();
    await new Promise(resolve => hanging.close(resolve));
  }
  const child = spawn(process.execPath, ["-e", `setInterval(()=>{},${TIME_UNITS.MINUTE_MS})`]);
  try {
    await assert.rejects(
      waitForProcessReady({
        child,
        url: "unused",
        label: "fixture",
        timeoutMs: TIME_UNITS.SECOND_MS / 10,
        probe: async () => false,
      }),
      /deadline/,
    );
  } finally {
    await stopChildProcess(child);
  }
});

test("Worker readiness deadline and startup cancellation await owned child teardown", async () => {
  const idle = `setInterval(()=>{},${TIME_UNITS.MINUTE_MS})`;
  await fixture(idle, `await assert.rejects(startPdfWorkerServer(),/readiness deadline/);`);
  await fixture(
    idle,
    `const controller=new AbortController();setTimeout(()=>controller.abort(new Error('fixture cancellation')),${TIME_UNITS.SECOND_MS / 20});await assert.rejects(startPdfWorkerServer(controller.signal),/fixture cancellation/);`,
  );
});
