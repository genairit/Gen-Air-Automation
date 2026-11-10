import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "../../src/api/gen-air-api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { PAYMENT_TERMS } from "../../src/constants/domain.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { seedApartment, seedBuilding, seedCustomer } from "../../src/api/seed-data.ts";
import { QUOTATION, QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";

const LINK_COPY = {
  SHARING_TITLE: "שיתוף עם דירות",
  PROJECT_QUOTES_TITLE: "הצעות מחיר",
  SHARING_SWITCH: "הצגת ההצעה גם בדירות נבחרות",
} as const;

const createBuildingQuotation = async (
  api: TGenAirApi,
  buildingId: string,
  customer: Awaited<ReturnType<typeof seedCustomer>>,
) => {
  const item = await createCatalogueFixture();
  const initial = await createQuotation(api, customer.id);
  const draft = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    projectId: buildingId,
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "Living room",
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [
          {
            id: randomUUID(),
            catalogueItemId: item.id,
            parentItemId: null,
            description: item.description,
            quotedPrice: item.price,
            quantity: "1",
            location: "Living room",
            circuit: null,
            requestedCapacityBtu: item.capacityBtu,
          },
        ],
      },
    ],
  });
  return { draft, customer };
};

const approveQuotation = async (
  api: TGenAirApi,
  draft: Awaited<ReturnType<typeof createBuildingQuotation>>["draft"],
) => {
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: draft.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map(warning => warning.key),
    }),
  );
  return quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: acknowledged.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
};

const projectQuotationCard = (page: Parameters<typeof createQuotationPage>[0]) =>
  page.getByRole("region", { name: LINK_COPY.PROJECT_QUOTES_TITLE });

test("approved building quotation shares one record with selected apartments and removal preserves the quotation", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const first = await seedApartment(api, building);
  const second = await seedApartment(api, building);
  const unselected = await seedApartment(api, building);
  const otherBuilding = await seedBuilding(api, await seedCustomer(api));
  const unrelated = await seedApartment(api, otherBuilding);
  const { draft } = await createBuildingQuotation(api, building.id, customer);
  const quote = createQuotationPage(page);

  await quote.goto(draft.id);
  const sharing = page.getByRole("region", { name: LINK_COPY.SHARING_TITLE });
  await expect(sharing).toBeVisible();
  await expect(sharing.getByRole("switch", { name: LINK_COPY.SHARING_SWITCH })).toBeDisabled();
  await expect(sharing.getByText("אפשר לשתף עם דירות לאחר אישור ההצעה.")).toBeVisible();
  await approveQuotation(api, draft);
  await page.reload();

  const sharingSwitch = sharing.getByRole("switch", { name: LINK_COPY.SHARING_SWITCH });
  await expect(sharingSwitch).toBeEnabled();
  await sharingSwitch.click();
  const choices = sharing.getByRole("group", { name: "בחירת דירות לשיתוף" });
  await expect(choices.getByRole("checkbox")).toHaveCount(3);
  await choices.getByRole("checkbox", { name: new RegExp(first.name) }).check();
  await choices.getByRole("checkbox", { name: new RegExp(second.name) }).check();
  const saved = page.waitForResponse(
    response =>
      response.url().endsWith(`/quotation/${draft.id}/apartment-links`) &&
      response.request().method() === HTTP_METHODS.PUT,
  );
  await sharing.getByRole("button", { name: "שמירת שיתוף" }).click();
  expect((await saved).status()).toBe(200);
  await expect(sharing.getByText("משותפת ל-2 דירות")).toBeVisible();

  const linked = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${draft.id}`),
  );
  expect(linked.id).toBe(draft.id);
  expect(linked.number).toBe(draft.number);
  expect(linked.customerId).toBe(customer.id);
  expect(linked.status).toBe(QUOTATION.STATUS.APPROVED);
  expect(linked.totals).toEqual(draft.totals);
  const stale = await api.send(HTTP_METHODS.PUT, `/quotation/${draft.id}/apartment-links`, {
    apartmentIds: [unselected.id],
    expectedApartmentIds: [],
  });
  expect(stale.status()).toBe(409);
  const afterStale: { apartmentLinks: { apartmentId: string }[] } = await (
    await api.send(HTTP_METHODS.GET, `/quotation/${draft.id}`)
  ).json();
  expect(afterStale.apartmentLinks.map(link => link.apartmentId).sort()).toEqual(
    [first.id, second.id].sort(),
  );

  for (const projectId of [building.id, first.id, second.id]) {
    await page.goto(
      projectId === building.id
        ? `/projects/${projectId}`
        : buildApartmentRoute(building.id, projectId),
    );
    const linkedRow = projectQuotationCard(page).getByRole("button", {
      name: new RegExp(draft.number),
    });
    await expect(linkedRow).toHaveCount(1);
    if (projectId === building.id) {
      await linkedRow.click();
      await expect(page).toHaveURL(new RegExp(`/quotations/${draft.id}#apartment-sharing$`));
    }
    if (projectId === first.id) {
      await linkedRow.click();
      await expect(page).toHaveURL(new RegExp(`/quotations/${draft.id}$`));
    }
  }
  for (const projectId of [unselected.id, unrelated.id]) {
    await page.goto(
      buildApartmentRoute(projectId === unrelated.id ? otherBuilding.id : building.id, projectId),
    );
    await expect(
      projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
    ).toHaveCount(0);
  }

  await page.goto("/quotations");
  await quote.field("חיפוש לפי מספר, לקוח, פרויקט או חברה").fill(draft.number);
  await expect(page.getByRole("button", { name: "הכל 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: new RegExp(draft.number) })).toHaveCount(1);

  await quote.goto(draft.id);
  await choices.getByRole("checkbox", { name: new RegExp(second.name) }).uncheck();
  await expect(sharing.getByText("שמירה תסיר את ההצעה מ-1 דירות.")).toBeVisible();
  const partial = page.waitForResponse(
    response =>
      response.url().endsWith(`/quotation/${draft.id}/apartment-links`) &&
      response.request().method() === HTTP_METHODS.PUT,
  );
  await sharing.getByRole("button", { name: "שמירת שיתוף" }).click();
  expect((await partial).status()).toBe(200);
  await expect(sharing.getByText("משותפת ל-1 דירות")).toBeVisible();
  await page.goto(buildApartmentRoute(building.id, first.id));
  await expect(
    projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
  ).toHaveCount(1);
  await page.goto(buildApartmentRoute(building.id, second.id));
  await expect(
    projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
  ).toHaveCount(0);

  await quote.goto(draft.id);
  await sharingSwitch.click();
  await expect(sharing.getByText("שמירה תסיר את ההצעה מ-1 דירות.")).toBeVisible();
  const removed = page.waitForResponse(
    response =>
      response.url().endsWith(`/quotation/${draft.id}/apartment-links`) &&
      response.request().method() === HTTP_METHODS.PUT,
  );
  await sharing.getByRole("button", { name: "הסרת שיתוף" }).click();
  expect((await removed).status()).toBe(200);
  await expect(sharing.getByText("ההצעה אינה משותפת עם דירות.")).toBeVisible();
  await page.reload();
  await expect(sharingSwitch).not.toBeChecked();
  const retained = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${draft.id}`),
  );
  expect(retained.id).toBe(draft.id);
  expect(retained.number).toBe(draft.number);
  expect(retained.status).toBe(QUOTATION.STATUS.APPROVED);
  expect(retained.totals).toEqual(draft.totals);
  await page.goto(`/projects/${building.id}`);
  await expect(
    projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
  ).toHaveCount(1);
  await page.goto(buildApartmentRoute(building.id, first.id));
  await expect(
    projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
  ).toHaveCount(0);
});

test("unrelated apartment link is rejected and project quotation lists require both read grants", async ({
  api,
  apiAs,
  openPageAs,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const unrelatedBuilding = await seedBuilding(api, await seedCustomer(api));
  const linkedApartment = await seedApartment(api, building);
  const unrelated = await seedApartment(api, unrelatedBuilding);
  const { draft } = await createBuildingQuotation(api, building.id, customer);
  await approveQuotation(api, draft);
  const rejected = await api.send(HTTP_METHODS.PUT, `/quotation/${draft.id}/apartment-links`, {
    apartmentIds: [unrelated.id],
    expectedApartmentIds: [],
  });
  expect(rejected.status()).toBe(400);
  const linked = await api.send(HTTP_METHODS.PUT, `/quotation/${draft.id}/apartment-links`, {
    apartmentIds: [linkedApartment.id],
    expectedApartmentIds: [],
  });
  expect(linked.status()).toBe(200);
  const adminDetail = await api.send(HTTP_METHODS.GET, `/quotation/${draft.id}`);
  expect(await adminDetail.json()).toMatchObject({
    primaryProject: { id: building.id },
    apartmentLinks: [{ apartmentId: linkedApartment.id }],
  });
  await withRolePermissions(USER_ROLES.ENGINEER, [PERMISSIONS.PROJECTS_READ], async () => {
    const limitedApi = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
    expect(
      (await limitedApi.send(HTTP_METHODS.GET, `/quotation/project/${building.id}`)).status(),
    ).toBe(403);
    const page = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
    await page.goto(`/projects/${building.id}`);
    await expect(projectQuotationCard(page)).toHaveCount(0);
  });
  await withRolePermissions(USER_ROLES.ENGINEER, [QUOTATION_PERMISSIONS.READ], async () => {
    const limitedApi = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
    expect(
      (await limitedApi.send(HTTP_METHODS.GET, `/quotation/project/${building.id}`)).status(),
    ).toBe(403);
    const detail = await limitedApi.send(HTTP_METHODS.GET, `/quotation/${draft.id}`);
    expect(detail.status()).toBe(200);
    expect(await detail.json()).toMatchObject({ primaryProject: null, apartmentLinks: [] });
  });
});

test("select all is a snapshot and reopening a shared quotation keeps links while locking sharing and context", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const building = await seedBuilding(api, customer);
  const first = await seedApartment(api, building);
  const second = await seedApartment(api, building);
  const { draft } = await createBuildingQuotation(api, building.id, customer);
  await approveQuotation(api, draft);
  const quote = createQuotationPage(page);
  await quote.goto(draft.id);
  const sharing = page.getByRole("region", { name: LINK_COPY.SHARING_TITLE });
  await sharing.getByRole("switch", { name: LINK_COPY.SHARING_SWITCH }).click();
  await sharing.getByRole("checkbox", { name: /בחירת כל הדירות/ }).check();
  await expect(
    sharing
      .getByRole("group", { name: "בחירת דירות לשיתוף" })
      .getByRole("checkbox", { checked: true }),
  ).toHaveCount(2);
  const saved = page.waitForResponse(
    response =>
      response.url().endsWith(`/quotation/${draft.id}/apartment-links`) &&
      response.request().method() === HTTP_METHODS.PUT,
  );
  await sharing.getByRole("button", { name: "שמירת שיתוף" }).click();
  expect((await saved).status()).toBe(200);

  const addedLater = await seedApartment(api, building);
  await page.reload();
  await expect(sharing.getByText("משותפת ל-2 דירות")).toBeVisible();
  await expect(
    sharing.getByRole("group", { name: "בחירת דירות לשיתוף" }).getByRole("checkbox"),
  ).toHaveCount(3);
  await page.goto(buildApartmentRoute(building.id, addedLater.id));
  await expect(
    projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
  ).toHaveCount(0);
  for (const apartment of [first, second]) {
    await page.goto(buildApartmentRoute(building.id, apartment.id));
    await expect(
      projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
    ).toHaveCount(1);
  }

  await quote.goto(draft.id);
  await quote.transition("פתיחה לעריכה (אותו מזהה)");
  await expect(sharing.getByRole("switch", { name: LINK_COPY.SHARING_SWITCH })).toBeDisabled();
  await expect(quote.field("פרויקט (אופציונלי)")).toBeDisabled();
  await expect(quote.field("לקוח *")).toBeDisabled();
  await page.goto(buildApartmentRoute(building.id, first.id));
  await expect(
    projectQuotationCard(page).getByRole("button", { name: new RegExp(draft.number) }),
  ).toHaveCount(1);
  const current = await quotationDocument(
    await api.send(HTTP_METHODS.GET, `/quotation/${draft.id}`),
  );
  expect(current.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(current.number).toBe(draft.number);
});
