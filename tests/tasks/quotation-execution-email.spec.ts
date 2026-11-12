import {
  TASK_TYPES,
  TASK_STATUSES,
  TASK_STATUS_NAMES,
} from "../../src/constants/domain.constant.ts";

import {
  APP_DIRECTORIES,
  AUTOMATION_DIRECTORIES,
} from "../../src/constants/environment.constant.ts";

import { join } from "node:path";
import { simpleParser } from "mailparser";
import { createTaskPage } from "../../src/pages/tasks.page.ts";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { readdir, readFile, writeFile, unlink } from "node:fs/promises";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { seedBuilding, seedCustomer } from "../../src/api/seed-data.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createQuotationEmailPage } from "../../src/pages/quotation-email.page.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { BASELINE_PERMISSIONS } from "../../src/constants/permission-baseline.constant.ts";
import { createUniqueEmail, createUniqueName } from "../../src/utilities/test-data.utility.ts";

const ROOT_FOLDER = "test-project-root";
const NESTED_FOLDER = "test-nested-folder";
const PLAN_FILE = {
  id: "test-execution-plan",
  name: "תוכנית לביצוע.pdf",
  mimeType: "application/pdf",
  isFolder: false,
};
const ZIP_FILE = {
  id: "test-execution-zip",
  name: "מסמכים.zip",
  mimeType: "application/zip",
  isFolder: false,
};

const seedQuotation = async (api: Parameters<typeof seedCustomer>[0]) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartmentCustomer = await seedCustomer(api);
  const apartmentNumber = createApartmentNumber();
  const apartment = await api.createApartment(building.id, {
    customerId: apartmentCustomer.id,
    customerFloor: 3,
    customerApartment: apartmentNumber,
  });
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE projects SET drive_folder_id = $2 WHERE id = $1", [
      apartment.id,
      `qa-project-${apartment.id}`,
    ]);
  } finally {
    await database.end();
  }
  const task = await api.createTask({
    projectId: apartment.id,
    taskType: TASK_TYPES.QUOTATION,
    title: `הצעת מחיר — ${apartment.name}`,
    description: "הכנת הצעה",
  });
  customerProjectIds.set(apartmentCustomer.id, apartment.id);
  return { building, apartment, apartmentCustomer, apartmentNumber, task };
};

const customerProjectIds = new Map<string, string>();

const addContact = async (
  api: Parameters<typeof seedCustomer>[0],
  customerId: string,
  name: string,
  email: string | null,
) => {
  const response = await api.send(HTTP_METHODS.POST, "/contact-directory", { name, email });
  expect(response.status()).toBe(201);
  const contact: unknown = await response.json();
  if (!isRecord(contact) || typeof contact.id !== "string" || typeof contact.name !== "string") {
    throw new Error("Contact creation returned an invalid response");
  }
  const projectId = customerProjectIds.get(customerId);
  if (projectId) {
    const linked = await api.send(HTTP_METHODS.POST, `/project/${projectId}/contacts`, {
      contactId: contact.id,
    });
    expect(linked.status()).toBe(201);
  }
  return { id: contact.id, name: contact.name };
};

const completeQuotation = async (api: Parameters<typeof seedCustomer>[0], taskId: string) => {
  const response = await api.send(HTTP_METHODS.PATCH, `/task/${taskId}/status`, {
    status: TASK_STATUSES.PROPOSAL_SENT,
  });
  expect(response.status()).toBe(200);
};

test("quotation completion offers an optional email and cancelling keeps the task complete", async ({
  page,
  api,
}) => {
  const { task } = await seedQuotation(api);
  const taskPage = createTaskPage(page);
  await taskPage.goto(task.id);
  await expect(page.getByRole("button", { name: "שליחת תוכנית לביצוע במייל" })).toHaveCount(0);
  await taskPage.statusTab(TASK_STATUS_NAMES.QUOTE_SENT).click();
  const emailPage = createQuotationEmailPage(page);
  const dialog = emailPage.dialog;
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("שלב 1 מתוך 2", { exact: false })).toBeVisible();
  await emailPage.cancel();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "שליחת תוכנית לביצוע במייל" })).toBeVisible();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
  const status = await api.send(HTTP_METHODS.GET, `/quotation-execution-email/${task.id}/status`);
  expect(status.status()).toBe(200);
  expect(await status.text()).toBe("");
});

test("email choices use shared blue controls and fit a reduced-motion mobile dialog", async ({
  page,
  api,
}) => {
  const { apartmentCustomer, task } = await seedQuotation(api);
  const architectName = createUniqueName("אדריכלית");
  await addContact(api, apartmentCustomer.id, architectName, createUniqueEmail("architect"));
  await completeQuotation(api, task.id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });

  const emailPage = createQuotationEmailPage(page);
  await emailPage.open(task.id);
  const dialog = emailPage.dialog;
  await expect(dialog).toHaveCSS("direction", "rtl");
  await expect(dialog).toHaveCSS("border-radius", "22px");
  await emailPage.chooseArchitect(architectName);
  await expect(dialog.getByRole("checkbox", { name: new RegExp(architectName) })).toBeChecked();
  await expect(dialog.getByRole("button", { name: "אדריכל ✓" })).toBeVisible();
  await emailPage.setVersion("03");
  await expect(emailPage.nextButton).toBeEnabled();
  await expect(emailPage.nextButton).toHaveCSS("background-image", /linear-gradient/);
  const dialogBounds = await dialog.boundingBox();
  if (!dialogBounds) {
    throw new Error("The quotation email dialog is not visible");
  }
  expect(dialogBounds.x).toBeGreaterThanOrEqual(0);
  expect(dialogBounds.x + dialogBounds.width).toBeLessThanOrEqual(390);
  await emailPage.continueToFiles();
  await expect(dialog.getByText("שלב 2 מתוך 2", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "חזרה לאנשי קשר" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "ביטול" })).toBeVisible();
  await expect(dialog.locator("section")).toHaveCSS("opacity", "1");
  await expect(dialog.locator("section")).toHaveCSS("transform", "none");

  const hasHorizontalOverflow = await dialog.evaluate(
    element => element.scrollWidth > element.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
  await dialog.screenshot({
    path: join(AUTOMATION_DIRECTORIES.RESULTS, "quotation-email-mobile.png"),
  });
});

test("recipient selection, nested file picker and exact preview require explicit valid choices", async ({
  page,
  api,
}) => {
  const { building, apartment, apartmentCustomer, apartmentNumber, task } =
    await seedQuotation(api);
  const architectName = createUniqueName("אדריכלית");
  const architectEmail = createUniqueEmail("architect");
  const unrelatedEmail = createUniqueEmail("unrelated");
  await addContact(api, apartmentCustomer.id, architectName, architectEmail);
  await addContact(api, apartmentCustomer.id, createUniqueName("ללא דואל"), null);
  await addContact(
    api,
    (await seedCustomer(api)).id,
    createUniqueName("איש קשר אחר"),
    unrelatedEmail,
  );
  await completeQuotation(api, task.id);
  await page.route(`**/api/project-drive/${apartment.id}/contents**`, route => {
    const folderId = new URL(route.request().url()).searchParams.get("folderId");
    const body =
      folderId === NESTED_FOLDER
        ? { folderId: NESTED_FOLDER, folders: [], files: [PLAN_FILE, ZIP_FILE] }
        : {
            folderId: ROOT_FOLDER,
            folders: [
              {
                id: NESTED_FOLDER,
                name: "תיקיית משנה",
                fileCount: 2,
                contentStatus: "has_content",
              },
            ],
            files: [],
          };
    return route.fulfill({ status: 200, json: body });
  });
  const emailPage = createQuotationEmailPage(page);
  await emailPage.open(task.id);
  const dialog = emailPage.dialog;
  await expect(dialog.getByText(architectName, { exact: false })).toBeVisible();
  await expect(dialog.getByText(unrelatedEmail)).toHaveCount(0);
  await expect(dialog.getByText("ללא דואל", { exact: false })).toHaveCount(0);
  const next = emailPage.nextButton;
  await expect(next).toBeDisabled();
  await emailPage.chooseArchitect(architectName);
  await expect(next).toBeDisabled();
  await emailPage.setVersion("03");
  await emailPage.continueToFiles();
  const send = emailPage.sendButton;
  await expect(send).toBeDisabled();
  await emailPage.openNestedFolder();
  await expect(dialog.getByText("תיקיית הפרויקט / תיקיית משנה")).toBeVisible();
  await emailPage.choosePlan();
  await expect(send).toBeDisabled();
  await emailPage.chooseZip();
  await expect(send).toBeEnabled();
  await expect(
    dialog.getByText(
      `נושא: ${building.name} | ${apartmentNumber} | ${architectName} | תוכנית מיזוג אוויר לביצוע`,
    ),
  ).toBeVisible();
  await expect(dialog.getByText("שלום,", { exact: false })).toContainText(`גרסת תוכנית 03`);
  await expect(dialog.getByText("שלום,", { exact: false })).toContainText("2. קובץ zip");
  await expect(dialog.getByRole("img", { name: "GenAir" })).toBeVisible();
  await expect(dialog.getByText("אדמין מנהל", { exact: true })).toBeVisible();
  await emailPage.cancel();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("selected contacts receive one exact email with two files and replay returns the saved receipt", async ({
  api,
}) => {
  const { building, apartment, apartmentCustomer, apartmentNumber, task } =
    await seedQuotation(api);
  const architectName = createUniqueName("אדריכלית");
  const architect = await addContact(
    api,
    apartmentCustomer.id,
    architectName,
    "qa-architect@example.test",
  );
  const other = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("מנהלת"),
    "qa-other@example.test",
  );
  const duplicateAddress = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("נציג נוסף"),
    "qa-architect@example.test",
  );
  await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("ללא בחירה"),
    "qa-unselected@example.test",
  );
  await completeQuotation(api, task.id);
  const requestId = crypto.randomUUID();
  const path = `/quotation-execution-email/${task.id}`;
  const payload = {
    requestId,
    recipientContactIds: [architect.id, other.id, duplicateAddress.id],
    architectContactId: architect.id,
    planVersion: "03",
    planFileId: `qa-plan-${apartment.id}`,
    zipFileId: `qa-zip-${apartment.id}`,
  };
  const existingMailFiles = new Set(await readdir(AUTOMATION_DIRECTORIES.MAIL));
  const simultaneous = await Promise.all([
    api.send(HTTP_METHODS.POST, `${path}/send`, payload),
    api.send(HTTP_METHODS.POST, `${path}/send`, payload),
  ]);
  const statuses = simultaneous.map(response => response.status());
  expect(statuses).toContain(201);
  expect(statuses.every(status => status === 201 || status === 409)).toBe(true);
  const first = simultaneous.find(response => response.status() === 201);
  if (!first) {
    throw new Error("No concurrent send succeeded");
  }
  const receiptBody: unknown = await first.json();
  if (
    !isRecord(receiptBody) ||
    typeof receiptBody.status !== "string" ||
    typeof receiptBody.providerMessageId !== "string"
  ) {
    throw new Error("Email send returned an invalid receipt");
  }
  const receipt = { status: receiptBody.status, providerMessageId: receiptBody.providerMessageId };
  expect(receipt.status).toBe("sent");
  expect(receipt.providerMessageId).toContain(requestId);
  const replay = await api.send(HTTP_METHODS.POST, `${path}/send`, payload);
  expect(replay.status()).toBe(201);
  expect(await replay.json()).toMatchObject(receipt);
  const secondRequest = await api.send(HTTP_METHODS.POST, `${path}/send`, {
    ...payload,
    requestId: crypto.randomUUID(),
  });
  expect(secondRequest.status()).toBe(409);
  const mailFiles = (await readdir(AUTOMATION_DIRECTORIES.MAIL)).filter(
    name => name.endsWith(".eml") && !existingMailFiles.has(name),
  );
  expect(mailFiles).toHaveLength(1);
  const mail = await simpleParser(await readFile(`${AUTOMATION_DIRECTORIES.MAIL}/${mailFiles[0]}`));
  expect(
    mail.to && "value" in mail.to ? mail.to.value.map(address => address.address).sort() : [],
  ).toEqual(["qa-architect@example.test", "qa-other@example.test"]);
  expect(mail.subject).toBe(
    `${building.name} | ${apartmentNumber} | ${architectName} | תוכנית מיזוג אוויר לביצוע`,
  );
  expect(mail.text?.trim()).toBe(
    [
      "שלום,",
      `מצורפת תוכנית מיזוג אוויר לביצוע עבור דירה ${apartmentNumber}`,
      "גרסת תוכנית 03",
      "למייל מצורפים:",
      "1. תוכנית מיזוג אוויר לביצוע",
      "2. קובץ zip",
      "במידה ויהיה עדכון על התוכניות הנ״ל אשלח כתשובה למייל זה",
      "בברכה,",
      "אדמין מנהל",
    ].join("\n"),
  );
  expect(mail.html).toContain("data:image/png;base64,");
  expect(
    mail.attachments
      .filter(file => file.contentDisposition === "attachment")
      .map(file => file.filename)
      .sort(),
  ).toEqual(["מסמכים.zip", "תוכנית לביצוע.pdf"]);
  expect(mail.attachments.find(file => file.contentDisposition === "inline")?.filename).toBe(
    "genair-logo.png",
  );
  const sidebarLogo = await readFile(join(APP_DIRECTORIES.FRONTEND, "src/assets/genair-logo.png"));
  expect(
    mail.attachments
      .find(file => file.contentDisposition === "inline")
      ?.content.equals(sidebarLogo),
  ).toBe(true);
  expect(
    mail.attachments.find(file => file.filename === "תוכנית לביצוע.pdf")?.content.toString(),
  ).toContain("%PDF-1.4");
  expect(
    mail.attachments
      .find(file => file.filename === "מסמכים.zip")
      ?.content.subarray(0, 4)
      .toString("hex"),
  ).toBe("504b0304");
  const status = await api.send(HTTP_METHODS.GET, `${path}/status`);
  expect((await status.json()).status).toBe("sent");
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("server rejects early, foreign, duplicate and unauthorized sends without changing completion", async ({
  api,
  apiAs,
}) => {
  const { apartmentCustomer, task } = await seedQuotation(api);
  const selected = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("אדריכל"),
    createUniqueEmail("architect"),
  );
  const foreignCustomer = await seedCustomer(api);
  const foreign = await addContact(
    api,
    foreignCustomer.id,
    createUniqueName("זר"),
    createUniqueEmail("foreign"),
  );
  const path = `/quotation-execution-email/${task.id}`;
  const draft = {
    requestId: crypto.randomUUID(),
    recipientContactIds: [selected.id],
    architectContactId: selected.id,
    planVersion: "03",
    planFileId: PLAN_FILE.id,
    zipFileId: ZIP_FILE.id,
  };
  expect((await api.send(HTTP_METHODS.GET, `${path}/context`)).status()).toBe(409);
  expect((await api.send(HTTP_METHODS.POST, `${path}/send`, draft)).status()).toBe(409);
  await completeQuotation(api, task.id);
  const contextResponse = await api.send(HTTP_METHODS.GET, `${path}/context`);
  expect(contextResponse.status()).toBe(200);
  const context: unknown = await contextResponse.json();
  if (!isRecord(context) || !Array.isArray(context.contacts)) {
    throw new Error("Email context returned an invalid contact list");
  }
  const contactIds = context.contacts.map(contact => {
    if (!isRecord(contact) || typeof contact.id !== "string") {
      throw new Error("Email context returned an invalid contact");
    }
    return contact.id;
  });
  expect(contactIds).toContain(selected.id);
  expect(contactIds).not.toContain(foreign.id);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/send`, {
        ...draft,
        recipientContactIds: [selected.id, foreign.id],
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/send`, {
        ...draft,
        recipientContactIds: [selected.id, selected.id],
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/send`, { ...draft, zipFileId: PLAN_FILE.id })
    ).status(),
  ).toBe(400);
  const installer = await apiAs(TEST_USERS[USER_ROLES.INSTALLER]);
  expect((await installer.send(HTTP_METHODS.GET, `${path}/context`)).status()).toBe(200);
  expect((await installer.send(HTTP_METHODS.POST, `${path}/send`, draft)).status()).toBe(403);
  for (const permission of [
    PERMISSIONS.PROJECTS_READ,
    PERMISSIONS.CUSTOMERS_READ,
    PERMISSIONS.DRIVE_READ,
  ]) {
    const grants = BASELINE_PERMISSIONS[USER_ROLES.SYSTEM_ADMIN].filter(
      grant => grant !== permission,
    );
    await withRolePermissions(USER_ROLES.SYSTEM_ADMIN, grants, async () => {
      expect((await api.send(HTTP_METHODS.GET, `${path}/context`)).status()).toBe(403);
      expect((await api.send(HTTP_METHODS.POST, `${path}/send`, draft)).status()).toBe(403);
    });
  }
  expect((await api.send(HTTP_METHODS.POST, `${path}/send`, draft)).status()).toBe(400);
  expect((await api.send(HTTP_METHODS.GET, `${path}/status`)).status()).toBe(200);
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("unavailable and outside-project files record failure, then a new request can succeed", async ({
  api,
}) => {
  const { apartment, apartmentCustomer, task } = await seedQuotation(api);
  const architect = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("אדריכל"),
    "qa-architect@example.test",
  );
  await completeQuotation(api, task.id);
  const path = `/quotation-execution-email/${task.id}`;
  const payload = {
    requestId: crypto.randomUUID(),
    recipientContactIds: [architect.id],
    architectContactId: architect.id,
    planVersion: "04",
    planFileId: "qa-missing",
    zipFileId: `qa-zip-${apartment.id}`,
  };
  const before = (await readdir(AUTOMATION_DIRECTORIES.MAIL)).length;
  expect((await api.send(HTTP_METHODS.POST, `${path}/send`, payload)).status()).toBe(404);
  const failed = await api.send(HTTP_METHODS.GET, `${path}/status`);
  expect(await failed.json()).toMatchObject({ status: "failed", retryable: true });
  expect((await api.send(HTTP_METHODS.POST, `${path}/send`, payload)).status()).toBe(409);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `${path}/send`, {
        ...payload,
        requestId: crypto.randomUUID(),
        planFileId: "qa-foreign-plan",
      })
    ).status(),
  ).toBe(400);
  const delivered = await api.send(HTTP_METHODS.POST, `${path}/send`, {
    ...payload,
    requestId: crypto.randomUUID(),
    planFileId: `qa-plan-${apartment.id}`,
  });
  expect(delivered.status()).toBe(201);
  expect((await delivered.json()).status).toBe("sent");
  expect((await readdir(AUTOMATION_DIRECTORIES.MAIL)).length).toBe(before + 1);
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("partial SMTP delivery stays uncertain and cannot resend automatically", async ({ api }) => {
  const { apartment, apartmentCustomer, task } = await seedQuotation(api);
  const architect = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("אדריכל"),
    "qa-architect@example.test",
  );
  const rejected = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("נדחה"),
    "qa-rejected@example.test",
  );
  await completeQuotation(api, task.id);
  const path = `/quotation-execution-email/${task.id}`;
  const payload = {
    requestId: crypto.randomUUID(),
    recipientContactIds: [architect.id, rejected.id],
    architectContactId: architect.id,
    planVersion: "05",
    planFileId: `qa-plan-${apartment.id}`,
    zipFileId: `qa-zip-${apartment.id}`,
  };
  const before = (await readdir(AUTOMATION_DIRECTORIES.MAIL)).length;
  expect((await api.send(HTTP_METHODS.POST, `${path}/send`, payload)).status()).toBe(409);
  const status = await api.send(HTTP_METHODS.GET, `${path}/status`);
  expect(await status.json()).toMatchObject({ status: "uncertain", retryable: false });
  expect((await api.send(HTTP_METHODS.POST, `${path}/send`, payload)).status()).toBe(409);
  expect((await readdir(AUTOMATION_DIRECTORIES.MAIL)).length).toBe(before + 1);
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("unavailable signature image records retryable failure without SMTP or task rollback", async ({
  api,
}) => {
  const { apartment, apartmentCustomer, task } = await seedQuotation(api);
  const architect = await addContact(
    api,
    apartmentCustomer.id,
    createUniqueName("אדריכלית"),
    "qa-architect@example.test",
  );
  await completeQuotation(api, task.id);
  const marker = `${AUTOMATION_DIRECTORIES.MAIL}/fail-logo`;
  const before = (await readdir(AUTOMATION_DIRECTORIES.MAIL)).length;
  const path = `/quotation-execution-email/${task.id}`;
  const payload = {
    requestId: crypto.randomUUID(),
    recipientContactIds: [architect.id],
    architectContactId: architect.id,
    planVersion: "08",
    planFileId: `qa-plan-${apartment.id}`,
    zipFileId: `qa-zip-${apartment.id}`,
  };
  await writeFile(marker, "fail");
  try {
    expect((await api.send(HTTP_METHODS.POST, `${path}/send`, payload)).status()).toBe(503);
  } finally {
    await unlink(marker);
  }
  const receipt = await api.send(HTTP_METHODS.GET, `${path}/status`);
  expect(await receipt.json()).toMatchObject({ status: "failed", retryable: true });
  expect((await readdir(AUTOMATION_DIRECTORIES.MAIL)).length).toBe(before);
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("browser sends selected project files and shows the saved success state", async ({
  page,
  api,
}) => {
  const { apartmentCustomer, task } = await seedQuotation(api);
  const architectName = createUniqueName("אדריכלית");
  await addContact(api, apartmentCustomer.id, architectName, "qa-architect@example.test");
  await completeQuotation(api, task.id);
  const emailPage = createQuotationEmailPage(page);
  await emailPage.open(task.id);
  await emailPage.chooseArchitect(architectName);
  await emailPage.setVersion("06");
  await emailPage.continueToFiles();
  await emailPage.openNestedFolder();
  await emailPage.choosePlan();
  await emailPage.chooseZip();
  await emailPage.sendButton.click();
  const dialog = emailPage.dialog;
  await expect(dialog.getByText("המייל כבר נשלח בהצלחה.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "שלח מייל" })).toHaveCount(0);
  await emailPage.cancel();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("browser reports unavailable project files and keeps completion after cancellation", async ({
  page,
  api,
}) => {
  const { apartment, apartmentCustomer, task } = await seedQuotation(api);
  const architectName = createUniqueName("אדריכלית");
  await addContact(api, apartmentCustomer.id, architectName, "qa-architect@example.test");
  await completeQuotation(api, task.id);
  await page.route(`**/api/project-drive/${apartment.id}/contents**`, route =>
    route.fulfill({ status: 503, json: { message: "Drive temporarily unavailable" } }),
  );
  const emailPage = createQuotationEmailPage(page);
  await emailPage.open(task.id);
  await emailPage.chooseArchitect(architectName);
  await emailPage.setVersion("07");
  await emailPage.continueToFiles();
  const dialog = emailPage.dialog;
  await expect(dialog.getByRole("alert")).toContainText("Drive temporarily unavailable");
  await expect(emailPage.sendButton).toBeDisabled();
  await emailPage.cancel();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("missing apartment number blocks preview and send but leaves the quotation completed", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const task = await api.createTask({
    projectId: building.id,
    taskType: TASK_TYPES.QUOTATION,
    title: `הצעת מחיר — ${building.name}`,
    description: "הכנת הצעה",
  });
  const architect = await addContact(
    api,
    customer.id,
    createUniqueName("אדריכלית"),
    "qa-architect@example.test",
  );
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/project/${building.id}/contacts`, {
        contactId: architect.id,
      })
    ).status(),
  ).toBe(201);
  await completeQuotation(api, task.id);
  const path = `/quotation-execution-email/${task.id}`;
  const preview = await api.send(HTTP_METHODS.POST, `${path}/preview`, {
    architectContactId: architect.id,
    planVersion: "09",
  });
  expect(preview.status()).toBe(400);
  const send = await api.send(HTTP_METHODS.POST, `${path}/send`, {
    requestId: crypto.randomUUID(),
    recipientContactIds: [architect.id],
    architectContactId: architect.id,
    planVersion: "09",
    planFileId: "qa-missing-plan",
    zipFileId: "qa-missing-zip",
  });
  expect(send.status()).toBe(409);
  const emailPage = createQuotationEmailPage(page);
  await emailPage.open(task.id);
  const dialog = emailPage.dialog;
  await expect(
    dialog.getByRole("alert").filter({ hasText: "יש להזין מספר דירה בפרויקט" }),
  ).toBeVisible();
  await emailPage.chooseArchitect(architect.name);
  await emailPage.setVersion("09");
  await expect(emailPage.nextButton).toBeDisabled();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});

test("no usable customer contacts shows feedback and prevents the file step", async ({
  page,
  api,
}) => {
  const { apartmentCustomer, task } = await seedQuotation(api);
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("UPDATE customer_contacts SET email = NULL WHERE customer_id = $1", [
      apartmentCustomer.id,
    ]);
  } finally {
    await database.end();
  }
  await completeQuotation(api, task.id);
  const emailPage = createQuotationEmailPage(page);
  await emailPage.open(task.id);
  await expect(emailPage.dialog.getByRole("alert")).toContainText(
    "לא נמצאו אנשי קשר עם כתובת מייל",
  );
  await expect(emailPage.nextButton).toBeDisabled();
  await emailPage.cancel();
  expect((await api.getTask(task.id)).status).toBe(TASK_STATUSES.PROPOSAL_SENT);
});
