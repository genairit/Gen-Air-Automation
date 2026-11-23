import { readdir } from "node:fs/promises";
import { createTaskPage } from "../../src/pages/tasks.page.ts";
import { createLoginPage } from "../../src/pages/login.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { quotationDocument } from "../../src/api/quotation.api.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { NAVIGATION_COPY } from "../../src/constants/copy.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { createTaskQuotation } from "../../src/api/task-quotation.api.ts";
import { seedTaskQuotationScenario } from "../../src/api/task-quotation.api.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { AUTOMATION_DIRECTORIES } from "../../src/constants/environment.constant.ts";
import { taskQuotationQuery } from "../../src/environment/task-quotation-fixtures.ts";

const scenario = seedTaskQuotationScenario;

for (const width of [1440, 390]) {
  test(`explicit keyboard create, pending guard, saved draft return and context controls at ${width}px`, async ({
    api,
    page,
  }) => {
    const { task } = await scenario(api);
    const transitions = await api.getTaskTransitions(task.id);
    const mail = await readdir(AUTOMATION_DIRECTORIES.MAIL);
    const requests: string[] = [];
    page.on("request", request => {
      if (
        request.method() === HTTP_METHODS.POST &&
        request.url().endsWith(`/task/${task.id}/quotation`)
      ) {
        requests.push(request.url());
      }
    });
    await page.setViewportSize({ width, height: 1000 });
    await createTaskPage(page).goto(task.id);
    const section = page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true });
    const create = section.getByRole("button", { name: "יצירת הצעת מחיר", exact: true });
    await expect(create).toBeEnabled();
    await page.reload();
    await expect(create).toBeEnabled();
    expect(requests).toEqual([]);
    expect(
      await taskQuotationQuery("SELECT quotation_id FROM task_quotation_links WHERE task_id=$1", [
        task.id,
      ]),
    ).toEqual([]);
    const pending = createDeferred();
    const observed = createDeferred();
    await page.route(`**/task/${task.id}/quotation`, async route => {
      if (route.request().method() !== HTTP_METHODS.POST) {
        return route.continue();
      }

      observed.resolve();
      await pending.promise;
      await route.continue();
    });
    await create.focus();
    await page.keyboard.press("Enter");
    await observed.promise;
    await expect(create).toBeDisabled();
    await page.keyboard.press("Enter");
    pending.resolve();
    await expect(page).toHaveURL(/\/quotations\/[0-9a-f-]{36}$/i);
    expect(requests).toHaveLength(1);
    const id = new URL(page.url()).pathname.split("/").at(-1)!;
    const quote = await quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`));
    expect(quote.status).toBe(QUOTATION.STATUS.DRAFT);
    await expect(
      page
        .getByText("ההצעה משויכת למשימה. פרטי ההקשר נשמרים בהתאם למשימה.", { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole("combobox", { name: "לקוח *", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("combobox", { name: "פרויקט (אופציונלי)", exact: true }),
    ).toBeDisabled();
    const back = page.getByRole("link", { name: new RegExp(`משימה: ${task.title}`) });
    await expect(back).toBeVisible();
    await back.click();
    await expect(section.getByText(quote.number, { exact: true })).toBeVisible();
    await expect(create).toHaveCount(0);
    const open = section.getByRole("button", { name: `פתיחת הצעה ${quote.number}`, exact: true });
    await expect(open).toBeVisible();
    await expect(section).toContainText("טיוטה");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
    await page.screenshot({
      path: test.info().outputPath(`task-quotation-${width}.png`),
      fullPage: true,
    });
    await open.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/quotations/${id}$`));
    expect(await api.getTaskTransitions(task.id)).toEqual(transitions);
    expect(await readdir(AUTOMATION_DIRECTORIES.MAIL)).toEqual(mail);
  });
}

test("lost committed response shows retry and recovers the same saved draft", async ({
  api,
  page,
}) => {
  const { task } = await scenario(api);
  const committed = { id: null as string | null };
  await page.route(`**/task/${task.id}/quotation`, async route => {
    if (route.request().method() !== HTTP_METHODS.POST || committed.id) {
      return route.continue();
    }

    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    committed.id = (await response.json()).quotationId;
    await route.abort("failed");
  });
  await createTaskPage(page).goto(task.id);
  const section = page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true });
  const create = section.getByRole("button", { name: "יצירת הצעת מחיר", exact: true });
  await create.click();
  await expect(section.getByRole("alert")).toBeVisible();
  await expect(create).toBeEnabled();
  await create.click();
  await expect(page).toHaveURL(new RegExp(`/quotations/${committed.id}$`));
  expect(
    await taskQuotationQuery("SELECT quotation_id FROM task_quotation_links WHERE task_id=$1", [
      task.id,
    ]),
  ).toEqual([{ quotation_id: committed.id }]);
});

test("reader can open existing quotation without create or task edit/status grants", async ({
  api,
  openPageAs,
}) => {
  const { task } = await scenario(api);
  const { quotationId } = await createTaskQuotation(api, task.id);
  const quote = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${quotationId}`),
  );
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.TASKS_READ, PERMISSIONS.QUOTATIONS_READ],
    async () => {
      const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      await createTaskPage(page).goto(task.id);
      const section = page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true });
      await expect(
        section.getByRole("button", { name: "יצירת הצעת מחיר", exact: true }),
      ).toHaveCount(0);
      await section
        .getByRole("button", { name: `פתיחת הצעה ${quote.number}`, exact: true })
        .click();
      await expect(page).toHaveURL(new RegExp(`/quotations/${quotationId}$`));
    },
  );
});

test("missing direct customer blocks create and no quotation grant suppresses protected fetch while task stays usable", async ({
  api,
  page,
  openPageAs,
}) => {
  const { task, project } = await scenario(api);
  await taskQuotationQuery("UPDATE projects SET customer_id=NULL WHERE id=$1", [project.id]);
  await page.setViewportSize({ width: 390, height: 1000 });
  await createTaskPage(page).goto(task.id);
  const section = page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true });
  await expect(section).toContainText("יש לשייך לקוח ישירות לפרויקט");
  await expect(section.getByRole("button", { name: "יצירת הצעת מחיר", exact: true })).toHaveCount(
    0,
  );
  expect(
    await taskQuotationQuery("SELECT quotation_id FROM task_quotation_links WHERE task_id=$1", [
      task.id,
    ]),
  ).toEqual([]);
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [PERMISSIONS.TASKS_READ, PERMISSIONS.PROJECTS_READ, PERMISSIONS.CUSTOMERS_READ],
    async () => {
      const reader = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      const protectedRequests: string[] = [];
      reader.on("request", request => {
        if (request.url().includes(`/task/${task.id}/quotations`)) {
          protectedRequests.push(request.url());
        }
      });
      await createTaskPage(reader).goto(task.id);
      await expect(reader.getByText(task.title, { exact: true }).first()).toBeVisible();
      await expect(
        reader.getByRole("region", { name: "הצעת מחיר משויכת", exact: true }),
      ).toHaveCount(0);
      expect(protectedRequests).toEqual([]);
    },
  );
});

test("a committed creation response arriving after account switch cannot navigate or expose the quotation", async ({
  api,
  page,
}) => {
  const { task } = await scenario(api);
  const held = createDeferred();
  const observed = createDeferred();
  const delivered = createDeferred();
  const committed = { id: null as string | null };
  await page.route(`**/task/${task.id}/quotation`, async route => {
    if (route.request().method() !== HTTP_METHODS.POST) {
      return route.continue();
    }

    const response = await route.fetch();
    committed.id = (await response.json()).quotationId;
    observed.resolve();
    await held.promise;
    await route.fulfill({ response });
    delivered.resolve();
  });
  await createTaskPage(page).goto(task.id);
  await page.getByRole("button", { name: "יצירת הצעת מחיר", exact: true }).click();
  await observed.promise;
  await page.getByText(NAVIGATION_COPY.LOGOUT, { exact: true }).click();
  const login = createLoginPage(page);
  await expect(login.heading).toBeVisible();
  await withRolePermissions(
    USER_ROLES.FINANCE,
    [PERMISSIONS.TASKS_READ, PERMISSIONS.PROJECTS_READ, PERMISSIONS.CUSTOMERS_READ],
    async () => {
      await login.login(TEST_USERS[USER_ROLES.FINANCE]);
      await expect(login.heading).toHaveCount(0);
      const accountUrl = page.url();
      held.resolve();
      await delivered.promise;
      await expect(page).toHaveURL(accountUrl);
      await expect(page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true })).toHaveCount(
        0,
      );
      expect(committed.id).not.toBeNull();
      expect(
        await taskQuotationQuery("SELECT quotation_id FROM task_quotation_links WHERE task_id=$1", [
          task.id,
        ]),
      ).toEqual([{ quotation_id: committed.id }]);
    },
  );
});

test("explicit secondary quotations render compact primary-first mobile rows and unrelated project quotations stay absent", async ({
  api,
  page,
}) => {
  const { task, customer, project } = await scenario(api);
  const primary = await quotationDocument(
    await api.send(
      HTTP_METHODS.GET,
      `/quotation/${(await createTaskQuotation(api, task.id)).quotationId}`,
    ),
  );
  const secondary = await quotationDocument(
    await api.send(HTTP_METHODS.POST, "/quotation", {
      customerId: customer.id,
      projectId: project.id,
    }),
  );
  const unrelated = await quotationDocument(
    await api.send(HTTP_METHODS.POST, "/quotation", {
      customerId: customer.id,
      projectId: project.id,
    }),
  );
  // Presentation fixture: actual clone propagation is exercised through the API in the companion spec.
  await taskQuotationQuery(
    "INSERT INTO task_quotation_links(task_id,quotation_id,is_primary) VALUES($1,$2,false)",
    [task.id, secondary.id],
  );
  await page.setViewportSize({ width: 390, height: 1000 });
  await createTaskPage(page).goto(task.id);
  const section = page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true });
  const open = section.getByRole("button", { name: /^פתיחת הצעה / });
  await expect(open).toHaveCount(2);
  await expect(open.nth(0)).toHaveAccessibleName(`פתיחת הצעה ${primary.number}`);
  await expect(open.nth(1)).toHaveAccessibleName(`פתיחת הצעה ${secondary.number}`);
  await expect(section.getByText(unrelated.number, { exact: true })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "יצירת הצעת מחיר", exact: true })).toHaveCount(
    0,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await open.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/quotations/${secondary.id}$`));
  await expect(page.getByRole("link", { name: new RegExp(`משימה: ${task.title}`) })).toBeVisible();
});

test("a readable saved quotation remains openable after its task project is deleted", async ({
  api,
  page,
}) => {
  const { task, project } = await scenario(api);
  const saved = await createTaskQuotation(api, task.id);
  const quote = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${saved.quotationId}`),
  );
  await taskQuotationQuery("UPDATE projects SET deleted_at=NOW() WHERE id=$1", [project.id]);
  await createTaskPage(page).goto(task.id);
  const section = page.getByRole("region", { name: "הצעת מחיר משויכת", exact: true });
  await expect(section.getByRole("button", { name: "יצירת הצעת מחיר", exact: true })).toHaveCount(
    0,
  );
  await section.getByRole("button", { name: `פתיחת הצעה ${quote.number}`, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/quotations/${saved.quotationId}$`));
  await expect(page.getByRole("heading", { name: quote.number, exact: true })).toBeVisible();
  expect(await createTaskQuotation(api, task.id)).toEqual({
    quotationId: saved.quotationId,
    created: false,
  });
  expect(
    await taskQuotationQuery("SELECT quotation_id FROM task_quotation_links WHERE task_id=$1", [
      task.id,
    ]),
  ).toEqual([{ quotation_id: saved.quotationId }]);
});
