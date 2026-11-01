import { parse } from "yaml";
import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const workflow = parse(
  readFileSync(new URL("../../.github/workflows/drive-repair-qa.yml", import.meta.url), "utf8"),
);
test("Drive repair runs only its complete spec on its own branch and immutable apps", () => {
  const job = workflow.jobs.repair;
  assert.match(job.if, /head.ref == 'fix-drive-release-budget'/);
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.match(job.env.FRONTEND_REF, /^[a-f0-9]{40}$/);
  assert.match(job.env.BACKEND_REF, /^[a-f0-9]{40}$/);
  assert.match(job.env.AUTOMATION_REF, /^[a-f0-9]{40}$/);
  const run = job.steps.find(step => step.name === "Run only affected regression files");
  assert.equal(
    run.run.trim(),
    "npx playwright test tests/projects/drive.spec.ts --retries=0 --global-timeout=1200000",
  );
  assert.equal(
    job.steps.find(step => step.uses?.startsWith("actions/upload-artifact@")).if,
    "${{ always() }}",
  );
  assert.doesNotMatch(JSON.stringify(workflow), /secrets\.|railway|supabase|gh pr merge/);
});
