import { parse } from "yaml";
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflow = parse(
  readFileSync(new URL("../../.github/workflows/release-repair-qa.yml", import.meta.url), "utf8"),
);
const job = workflow.jobs.repair;
const run = job.steps.find(step => step.name === "Run only affected regression files");

test("repair QA is branch-scoped and cannot run a duplicate full suite or deploy", () => {
  assert.deepEqual(Object.keys(workflow.on).sort(), ["pull_request", "workflow_dispatch"]);
  assert.deepEqual(workflow.on.pull_request.branches, ["dev"]);
  assert.match(job.if, /head\.repo\.full_name == github\.repository/);
  assert.match(job.if, /head\.ref == 'fix-contact-automation'/);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  for (const file of [
    "tests/auth/feature-permissions-ui.spec.ts",
    "tests/customers/customers.spec.ts",
    "tests/customers/customer-projects.spec.ts",
    "tests/projects/apartment-design.spec.ts",
    "tests/tasks/tasks.spec.ts",
  ]) {
    assert.ok(run.run.includes(file));
  }
  assert.doesNotMatch(run.run, /npx playwright test\s*$/);
  assert.doesNotMatch(JSON.stringify(workflow), /secrets\.|railway|supabase|gh pr merge/);
});

test("repair checks out immutable application refs without persisted credentials", () => {
  assert.match(job.env.BACKEND_REF, /^[a-f0-9]{40}$/);
  assert.match(job.env.FRONTEND_REF, /^[a-f0-9]{40}$/);
  assert.doesNotMatch(JSON.stringify(job.env), /runner\./);
  const checkouts = job.steps.filter(step => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkouts.length, 3);
  assert.ok(checkouts.every(step => step.with["persist-credentials"] === false));
  assert.ok(checkouts.every(step => step.with.ref));
});

test("bounded test execution leaves time to upload evidence on failure", () => {
  assert.match(run.run, /--retries=0 --global-timeout=1200000/);
  assert.ok(run["timeout-minutes"] < job["timeout-minutes"]);
  assert.equal(run.env.GEN_AIR_ARTIFACTS_DIR, "${{ runner.temp }}/release-repair-qa");
  const upload = job.steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
  assert.equal(upload.if, "${{ always() }}");
  assert.match(upload.with.path, /release-repair-qa\/results\.json/);
  assert.doesNotMatch(upload.with.path, /database|auth|backend-runtime|\.env/);
});
