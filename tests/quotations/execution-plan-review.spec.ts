import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { createQuotation, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

interface IPlanSnapshot {
  id: string;
  status: string;
  revision: number;
  driveFileVersion: string;
  checklist: { key: string; label: string; confirmed: boolean }[];
}

const seedPlanContext = async (api: TGenAirApi) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const created = await createQuotation(api, customer.id);
  const quotation = await saveQuotation(api, created.id, {
    ...quotationWrite(created),
    projectId: project.id,
  });
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE projects SET drive_folder_id = $2 WHERE id = $1", [
      project.id,
      `qa-project-${project.id}`,
    ]);
  } finally {
    await database.end();
  }
  return { project, quotation, fileId: `qa-plan-${project.id}` };
};

const createPlan = async (
  api: TGenAirApi,
  context: { quotation: { id: string }; project: { id: string }; fileId: string },
  planVersion: string,
) => {
  const response = await api.send(HTTP_METHODS.POST, "/execution-plan", {
    quotationId: context.quotation.id,
    projectId: context.project.id,
    driveFileId: context.fileId,
    planVersion,
  });
  expect(response.status()).toBe(201);
  return (await response.json()) as IPlanSnapshot;
};

const completeChecklist = async (api: TGenAirApi, submission: IPlanSnapshot) => {
  const response = await api.send(
    HTTP_METHODS.PATCH,
    `/execution-plan/${submission.id}/checklist`,
    { revision: submission.revision, confirmedKeys: submission.checklist.map(item => item.key) },
  );
  expect(response.status()).toBe(200);
  return (await response.json()) as IPlanSnapshot;
};

test("submitter confirms six saved checks and lead reviews the exact plan inside the quotation", async ({
  api,
  page,
  openPageAs,
}) => {
  const context = await seedPlanContext(api);
  await createProjectPage(page).goto(context.project.id);
  await openWorkspaceTab(page, "files");
  await createProjectPage(page).driveFolder("תיקיית משנה").click();
  await page.getByRole("button", { name: "הגש תוכנית לביצוע: תוכנית לביצוע.pdf" }).click();
  const dialog = page.getByRole("dialog", { name: "הגשת תוכנית לביצוע" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "הצעת מחיר קשורה" }).click();
  await page.getByRole("option", { name: new RegExp(context.quotation.number) }).click();
  await dialog.getByRole("textbox", { name: "גרסת תוכנית" }).fill("01");
  await dialog.getByRole("button", { name: "המשך לבדיקות" }).click();
  await expect(dialog.getByRole("checkbox")).toHaveCount(6);
  await expect(dialog.getByRole("status")).toContainText("0 מתוך 6");
  await expect(dialog.getByRole("button", { name: "שלח לאישור" })).toBeDisabled();
  await dialog.getByRole("checkbox").first().click();
  await expect(dialog.getByRole("status")).toContainText("1 מתוך 6");
  await dialog.getByRole("button", { name: "סגור" }).click();
  await page.getByRole("button", { name: "הגש תוכנית לביצוע: תוכנית לביצוע.pdf" }).click();
  await expect(dialog.getByRole("checkbox").first()).toBeChecked();
  for (const checkbox of await dialog.getByRole("checkbox").all()) {
    if (!(await checkbox.isChecked())) {
      await checkbox.click();
      await expect(checkbox).toBeChecked();
    }
  }
  await expect(dialog.getByRole("status")).toContainText("6 מתוך 6");
  await dialog.getByRole("button", { name: "שלח לאישור" }).click();
  await expect(dialog).toHaveCount(0);

  const leadPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEERING_LEAD]);
  await leadPage.goto(`/projects/${context.project.id}?tab=quotations`);
  await leadPage.getByText(context.quotation.number, { exact: true }).click();
  await expect(leadPage.getByRole("link", { name: "תוכנית לביצוע.pdf" })).toBeVisible();
  await expect(leadPage.getByRole("region", { name: "אישור תוכנית לביצוע" })).toBeVisible();
  await expect(leadPage.getByText("גרסת Drive שנרשמה בהגשה: 1", { exact: false })).toBeVisible();
  await expect(
    leadPage.getByRole("region", { name: "אישור תוכנית לביצוע" }).getByRole("listitem"),
  ).toHaveCount(6);
  await leadPage.getByRole("button", { name: "אשר תוכנית לביצוע" }).click();
  await expect(leadPage.getByText("תוכנית מאושרת", { exact: true })).toBeVisible();
  await leadPage.reload();
  await expect(leadPage.getByText("תוכנית מאושרת", { exact: true })).toBeVisible();
});

test("API rejects incomplete, unauthorized, self, stale and version-mismatched decisions", async ({
  api,
  apiAs,
}) => {
  const context = await seedPlanContext(api);
  const submission = await createPlan(api, context, "01");
  expect(submission.checklist).toHaveLength(6);
  expect(submission.checklist.every(item => !item.confirmed)).toBe(true);
  const submitPath = `/execution-plan/${submission.id}/submit`;
  expect((await api.send(HTTP_METHODS.POST, submitPath, { revision: 0 })).status()).toBe(400);
  const checked = await completeChecklist(api, submission);
  const pendingResponse = await api.send(HTTP_METHODS.POST, submitPath, {
    revision: checked.revision,
  });
  expect(pendingResponse.status()).toBe(201);
  const pending = (await pendingResponse.json()) as IPlanSnapshot;
  expect(pending.status).toBe("pending");
  const decisionPath = `/execution-plan/${pending.id}/decision`;
  const approve = { revision: pending.revision, decision: "approve" };
  expect((await api.send(HTTP_METHODS.POST, decisionPath, approve)).status()).toBe(403);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect((await engineer.send(HTTP_METHODS.POST, decisionPath, approve)).status()).toBe(403);
  const lead = await apiAs(TEST_USERS[USER_ROLES.ENGINEERING_LEAD]);
  expect(
    (
      await lead.send(HTTP_METHODS.POST, decisionPath, {
        revision: pending.revision,
        decision: "return",
      })
    ).status(),
  ).toBe(400);
  const returnedResponse = await lead.send(HTTP_METHODS.POST, decisionPath, {
    revision: pending.revision,
    decision: "return",
    comment: "חסר חישוב אוויר חוזר",
  });
  expect(returnedResponse.status()).toBe(201);
  const returned = (await returnedResponse.json()) as IPlanSnapshot;
  expect(returned.status).toBe("returned");
  expect((await lead.send(HTTP_METHODS.POST, decisionPath, approve)).status()).toBe(409);
  const marker = join(AUTOMATION_DIRECTORIES.DATABASE, "fake-drive", `version-${context.fileId}`);
  await mkdir(join(AUTOMATION_DIRECTORIES.DATABASE, "fake-drive"), { recursive: true });
  await writeFile(marker, "2");
  const revised = await createPlan(api, context, "02");
  expect(revised.driveFileVersion).toBe("2");
  expect(revised.checklist.every(item => !item.confirmed)).toBe(true);
  expect(
    (await api.send(HTTP_METHODS.POST, submitPath, { revision: returned.revision })).status(),
  ).toBe(409);
  const revisedChecked = await completeChecklist(api, revised);
  const revisedPending = await api.send(HTTP_METHODS.POST, `/execution-plan/${revised.id}/submit`, {
    revision: revisedChecked.revision,
  });
  expect(revisedPending.status()).toBe(201);
  await writeFile(marker, "3");
  const revisedSnapshot = (await revisedPending.json()) as IPlanSnapshot;
  expect(
    (
      await lead.send(HTTP_METHODS.POST, `/execution-plan/${revised.id}/decision`, {
        revision: revisedSnapshot.revision,
        decision: "approve",
      })
    ).status(),
  ).toBe(409);
  const cancelled = await api.send(HTTP_METHODS.POST, `/execution-plan/${revised.id}/cancel`, {
    revision: revisedSnapshot.revision,
  });
  expect(cancelled.status()).toBe(201);
  expect((await cancelled.json()).status).toBe("cancelled");
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/execution-plan/${revised.id}/cancel`, {
        revision: revisedSnapshot.revision,
      })
    ).status(),
  ).toBe(409);
});

test("one quotation displays both submitted project plans for review", async ({
  api,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);
  const created = await createQuotation(api, customer.id);
  const quotation = await saveQuotation(api, created.id, {
    ...quotationWrite(created),
    projectId: building.id,
  });
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      "INSERT INTO quotation_projects (quotation_id, project_id, is_primary) VALUES ($1, $2, false)",
      [quotation.id, apartment.id],
    );
    for (const project of [building, apartment]) {
      await database.query("UPDATE projects SET drive_folder_id = $2 WHERE id = $1", [
        project.id,
        `qa-project-${project.id}`,
      ]);
    }
  } finally {
    await database.end();
  }
  for (const [project, planVersion] of [
    [building, "01"],
    [apartment, "02"],
  ] as const) {
    const draft = await createPlan(
      api,
      { quotation, project, fileId: `qa-plan-${project.id}` },
      planVersion,
    );
    const checked = await completeChecklist(api, draft);
    const submitted = await api.send(HTTP_METHODS.POST, `/execution-plan/${draft.id}/submit`, {
      revision: checked.revision,
    });
    expect(submitted.status()).toBe(201);
  }
  const leadPage = await openPageAs(TEST_USERS[USER_ROLES.ENGINEERING_LEAD]);
  await leadPage.goto(`/quotations/${quotation.id}`);
  const reviews = leadPage.getByRole("region", { name: "אישור תוכנית לביצוע" });
  await expect(reviews.getByRole("button", { name: "אשר תוכנית לביצוע" })).toHaveCount(2);
  for (const value of [building.name, apartment.name, "01", "02"]) {
    await expect(reviews.getByText(value, { exact: true })).toBeVisible();
  }
});
