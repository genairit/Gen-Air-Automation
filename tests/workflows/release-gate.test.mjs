import { parse } from "yaml";
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { prepare, finish, validatePullRequest } from "../../.github/scripts/release-gate.mjs";
import { refreshFrontendGates } from "../../../Gen-Air-Backend/.github/scripts/refresh-frontend-gates.mjs";

const createContext = (source = "dev", target = "test") => ({
  eventName: "pull_request",
  repo: { owner: "genairit", repo: "Gen-Air-Frontend" },
  payload: {
    pull_request: {
      number: 7,
      base: { ref: target, sha: "base" },
      head: { ref: source, sha: "head", repo: { full_name: "genairit/Gen-Air-Frontend" } },
    },
  },
});

const createHarness = (context = createContext()) => {
  const statuses = [];
  const outputs = {};
  const errors = [];
  const reruns = [];
  const backend = { sha: "backend-before" };
  const request = {
    ...context.payload.pull_request,
    merge_commit_sha: "candidate-merge",
    mergeable: true,
  };
  const core = {
    info: () => {},
    warning: () => {},
    setFailed: message => errors.push(message),
    setOutput: (name, value) => {
      outputs[name] = value;
    },
    summary: {
      addHeading: () => core.summary,
      addTable: () => core.summary,
      write: async () => {},
    },
  };
  const github = {
    rest: {
      repos: {
        createCommitStatus: async status => statuses.push(status),
        getCommit: async () => ({ data: backend }),
      },
      pulls: { get: async () => ({ data: request }), list: "pulls" },
      actions: { listWorkflowRuns: "runs", reRunWorkflow: async run => reruns.push(run) },
    },
    paginate: async method =>
      method === "pulls"
        ? [request]
        : [{ id: 1, status: "completed", pull_requests: [{ number: 7 }] }],
  };
  return { github, core, context, statuses, outputs, errors, backend, request, reruns };
};

for (const [source, target] of [
  ["dev", "test"],
  ["test", "main"],
]) {
  test(`accepts ${source} → ${target}`, () => {
    assert.equal(validatePullRequest(createContext(source, target)).target, target);
  });
}

for (const [source, target] of [
  ["feature", "dev"],
  ["dev", "main"],
  ["feature", "main"],
  ["feature", "test"],
  ["main", "dev"],
  ["test", "dev"],
  ["dev", "dev"],
  ["feature", "other"],
]) {
  test(`rejects ${source} → ${target}`, () => {
    assert.throws(() => validatePullRequest(createContext(source, target)));
  });
}

for (const repository of ["Gen-Air-Backend", "Gen-Air-Automation"]) {
  test(`rejects caller ${repository}`, () => {
    const context = createContext();
    context.repo.repo = repository;
    assert.throws(() => validatePullRequest(context), /Only Gen-Air-Frontend/);
  });
}

test("rejects manual and foreign callers", () => {
  const context = createContext();
  context.eventName = "workflow_dispatch";
  assert.throws(() => validatePullRequest(context));
  context.eventName = "pull_request";
  context.payload.pull_request.head.repo.full_name = "external/fork";
  assert.throws(() => validatePullRequest(context));
});

test("pins candidate merge and backend SHA and requires immutable Automation", async () => {
  const harness = createHarness();
  process.env.AUTOMATION_REF = "a".repeat(40);
  await prepare(harness);
  assert.deepEqual(harness.outputs, {
    "backend-ref": "backend-before",
    "frontend-ref": "candidate-merge",
  });
  assert.equal(harness.statuses[0].state, "pending");
  process.env.AUTOMATION_REF = "main";
  await assert.rejects(prepare(harness), /full commit SHA/);
});

test("rejects moved heads, bases and conflicts", async () => {
  process.env.AUTOMATION_REF = "a".repeat(40);
  for (const replacement of [
    { head: { sha: "new" } },
    { base: { sha: "new" } },
    { mergeable: false },
    { mergeable: null },
    { merge_commit_sha: null },
  ]) {
    const harness = createHarness();
    Object.assign(harness.request, replacement);
    await assert.rejects(prepare(harness), /PR changed or cannot merge/);
  }
});

test("missing backend dependency fails, then a refreshed integration pass succeeds", async () => {
  const harness = createHarness();
  process.env.SUITE_OUTCOME = "failure";
  process.env.TESTED_BACKEND_REF = harness.backend.sha;
  await finish(harness);
  assert.equal(harness.statuses.at(-1).state, "failure");
  assert.match(harness.errors[0], /merge backend dependencies first/);
  harness.backend.sha = "dependency-merged";
  process.env.TESTED_BACKEND_REF = harness.backend.sha;
  process.env.SUITE_OUTCOME = "success";
  await finish(harness);
  assert.equal(harness.statuses.at(-1).state, "success");
});

test("backend or frontend movement invalidates a passing suite", async () => {
  process.env.TESTED_BACKEND_REF = "backend-before";
  process.env.SUITE_OUTCOME = "success";
  const movedBackend = createHarness();
  movedBackend.backend.sha = "backend-after";
  await finish(movedBackend);
  assert.equal(movedBackend.statuses.at(-1).state, "failure");
  const movedFrontend = createHarness();
  movedFrontend.request.head = { sha: "new" };
  await finish(movedFrontend);
  assert.equal(movedFrontend.statuses.at(-1).state, "failure");
});

test("API failures propagate without publishing success", async () => {
  const harness = createHarness();
  process.env.AUTOMATION_REF = "a".repeat(40);
  harness.github.rest.repos.getCommit = async () => {
    throw new Error("unavailable");
  };
  await assert.rejects(prepare(harness), /unavailable/);
  await assert.rejects(finish(harness), /unavailable/);
  assert.ok(harness.statuses.every(status => status.state !== "success"));
});

const createRefreshHarness = (target = "test") => {
  const source = target === "main" ? "test" : "dev";
  const harness = createHarness(createContext(source, target));
  harness.context = {
    eventName: "push",
    ref: `refs/heads/${target}`,
    repo: { owner: "genairit", repo: "Gen-Air-Backend" },
  };
  return harness;
};

test("backend push invalidates frontend result before rerunning its gate", async () => {
  const harness = createRefreshHarness();
  await refreshFrontendGates(harness);
  assert.equal(harness.statuses[0].state, "pending");
  assert.deepEqual(harness.reruns, [{ owner: "genairit", repo: "Gen-Air-Frontend", run_id: 1 }]);
});

test("unsupported paths and forks are not refreshed", async () => {
  const harness = createRefreshHarness("main");
  harness.request.head.ref = "feature";
  await refreshFrontendGates(harness);
  assert.equal(harness.statuses.length, 0);
  harness.request.head.ref = "dev";
  harness.request.head.repo.full_name = "external/fork";
  harness.context.ref = "refs/heads/test";
  await refreshFrontendGates(harness);
  assert.equal(harness.statuses.length, 0);
});

test("absent or active runs remain blocked for an explicit rerun", async () => {
  for (const runs of [[], [{ status: "in_progress", pull_requests: [{ number: 7 }] }]]) {
    const harness = createRefreshHarness();
    harness.github.paginate = async method => (method === "pulls" ? [harness.request] : runs);
    await refreshFrontendGates(harness);
    assert.equal(harness.statuses[0].state, "pending");
    assert.equal(harness.reruns.length, 0);
  }
});

test("invalid refresh context and inaccessible token fail visibly", async () => {
  const harness = createRefreshHarness();
  harness.context.ref = "refs/heads/feature";
  await assert.rejects(refreshFrontendGates(harness), /Unsupported/);
  harness.context.eventName = "pull_request";
  await assert.rejects(refreshFrontendGates(harness), /Only backend/);
  harness.context.eventName = "push";
  harness.context.ref = "refs/heads/test";
  harness.github.paginate = async () => {
    throw new Error("403");
  };
  await assert.rejects(refreshFrontendGates(harness), /403/);
});

const readWorkflow = path => parse(readFileSync(new URL(path, import.meta.url), "utf8"));

test("actual workflows only start the suite from frontend release PRs", () => {
  const automation = readWorkflow("../../.github/workflows/e2e.yml");
  const frontend = readWorkflow("../../../Gen-Air-Frontend/.github/workflows/merge-gate.yml");
  const backend = readWorkflow(
    "../../../Gen-Air-Backend/.github/workflows/refresh-frontend-gates.yml",
  );
  assert.deepEqual(Object.keys(automation.on), ["workflow_call"]);
  assert.deepEqual(Object.keys(frontend.on), ["pull_request"]);
  assert.deepEqual(frontend.on.pull_request.branches, ["test", "main"]);
  assert.deepEqual(Object.keys(backend.on), ["push"]);
  assert.deepEqual(backend.on.push.branches, ["test", "main"]);
  assert.ok(automation.jobs.playwright.if.includes("github.event_name == 'pull_request'"));
  assert.ok(
    automation.jobs.playwright.if.includes("github.repository == 'genairit/Gen-Air-Frontend'"),
  );
  assert.equal(Object.keys(backend.jobs).length, 1);
  assert.equal(
    backend.jobs.refresh.steps.some(step => step.run?.includes("playwright")),
    false,
  );
});

for (const [source, target] of [
  ["dev", "test"],
  ["test", "main"],
]) {
  test(`resolves backend ${target} for ${source} → ${target}`, async () => {
    const harness = createHarness(createContext(source, target));
    const resolvedRefs = [];
    harness.github.rest.repos.getCommit = async input => {
      resolvedRefs.push(input);
      return { data: harness.backend };
    };
    process.env.AUTOMATION_REF = "a".repeat(40);
    await prepare(harness);
    assert.deepEqual(resolvedRefs, [{ owner: "genairit", repo: "Gen-Air-Backend", ref: target }]);
  });
}

test("Playwright collection excludes workflow contracts", async () => {
  const { default: configuration } = await import("../../playwright.config.ts");
  assert.ok(configuration.testIgnore.includes("**/workflows/**"));
});

test("retargeting to a branch at the same SHA invalidates prepare and finish", async () => {
  const harness = createHarness();
  harness.request.base = { ...harness.request.base, ref: "main" };
  process.env.AUTOMATION_REF = "a".repeat(40);
  await assert.rejects(prepare(harness), /PR changed/);
  process.env.SUITE_OUTCOME = "success";
  process.env.TESTED_BACKEND_REF = harness.backend.sha;
  await finish(harness);
  assert.equal(harness.statuses.at(-1).state, "failure");
});

test("feature → dev cannot call the automatic gate or publish compatibility", async () => {
  const harness = createHarness(createContext("feature", "dev"));
  await assert.rejects(prepare(harness), /Feature → dev is verified by QA/);
  await assert.rejects(finish(harness), /Feature → dev is verified by QA/);
  assert.equal(harness.statuses.length, 0);
});

test("backend dev cannot refresh a feature → dev gate", async () => {
  const harness = createRefreshHarness("dev");
  await assert.rejects(refreshFrontendGates(harness), /Unsupported/);
  assert.equal(harness.statuses.length, 0);
  assert.equal(harness.reruns.length, 0);
});

test("backend main refreshes only the frontend test → main promotion", async () => {
  const harness = createRefreshHarness("main");
  await refreshFrontendGates(harness);
  assert.equal(harness.statuses[0].state, "pending");
  assert.equal(harness.reruns.length, 1);
});
