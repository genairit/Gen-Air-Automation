import { parse } from "yaml";
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflow = parse(
  readFileSync(new URL("../../.github/workflows/questionnaire-qa.yml", import.meta.url), "utf8"),
);
const job = workflow.jobs.questionnaire;
const commands = job.steps
  .filter(step => step.run)
  .map(step => step.run)
  .join("\n");

test("targeted QA cannot become a duplicate full regression or deployment trigger", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ["pull_request", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.pull_request.branches, ["dev"]);
  assert.match(job.if, /github\.repository == 'genairit\/Gen-Air-Automation'/);
  assert.match(job.if, /head\.repo\.full_name == github\.repository/);
  assert.match(job.if, /head\.ref == 'questionnaire-persistence-qa'/);
  assert.match(commands, /npx playwright test --config playwright\.questionnaire\.config\.ts/);
  assert.doesNotMatch(commands, /npx playwright test\s*$/m);
  assert.doesNotMatch(commands, /railway|supabase|git push|gh pr merge/i);
  assert.deepEqual(workflow.permissions, { contents: "read" });
});

test("candidate and backend revisions are pinned; no credentials or live database enter the workflow", () => {
  assert.match(job.env.BACKEND_REF, /^[a-f0-9]{40}$/);
  const checkouts = job.steps.filter(step => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkouts.length, 2);
  assert.ok(checkouts.every(step => step.with["persist-credentials"] === false));
  assert.ok(checkouts.every(step => step.with.ref));
  assert.doesNotMatch(JSON.stringify(workflow), /secrets\./);
  assert.match(commands, /sha256sum --check --strict/);
  assert.match(commands, /git -C Gen-Air-Backend rev-parse HEAD/);
});

test("published artifacts exclude disposable database and authentication state", () => {
  const upload = job.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
  assert.ok(upload);
  assert.match(upload.with.path, /questionnaire-qa\/results\.json/);
  assert.doesNotMatch(upload.with.path, /database|auth|backend-runtime|\.env/);
});
