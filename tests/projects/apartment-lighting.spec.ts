import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { createApartmentFormPage } from "../../src/pages/apartment.page.ts";
import { readBuildingApartments } from "../../src/api/apartment-import.api.ts";
import { seedApartment, seedBuilding, seedCustomer } from "../../src/api/seed-data.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { PROJECT_CONSTRAINTS } from "../../src/constants/project-constraints.constant.ts";

type Lighting = {
  hasOwnLighting: boolean;
  hasGeneralLightingCeilingLowering: boolean;
  generalLightingCeilingLoweringHeight: number | null;
};

const readLighting = async (api: Parameters<typeof seedBuilding>[0], projectId: string) => {
  const response = await api.send(HTTP_METHODS.GET, `/project/${projectId}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as Lighting;
};

const setBuildingLighting = async (
  api: Parameters<typeof seedBuilding>[0],
  buildingId: string,
  height: number,
) => {
  const response = await api.send(HTTP_METHODS.PATCH, `/project/${buildingId}`, {
    hasGeneralLightingCeilingLowering: true,
    generalLightingCeilingLoweringHeight: height,
  });
  expect(response.ok()).toBe(true);
};

test("apartment detail follows live building lighting until a local override is saved and reset", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  await setBuildingLighting(api, building.id, 25);
  const first = await seedApartment(api, building);
  const neighbor = await seedApartment(api, building);

  await page.goto(buildApartmentRoute(building.id, first.id));
  const lightingCard = page
    .getByText("הנמכה כללית לתאורה", { exact: true })
    .first()
    .locator("xpath=ancestor::section[1]");
  await expect(lightingCard.getByText("מפרויקט האב", { exact: true })).toBeVisible();
  await expect(lightingCard.getByText("25 ס״מ", { exact: true })).toBeVisible();
  expect(await readLighting(api, first.id)).toMatchObject({
    hasOwnLighting: false,
    hasGeneralLightingCeilingLowering: true,
    generalLightingCeilingLoweringHeight: 25,
  });

  await setBuildingLighting(api, building.id, 30);
  await page.reload();
  await expect(lightingCard.getByText("30 ס״מ", { exact: true })).toBeVisible();
  await lightingCard.getByRole("button", { name: "שנה לדירה זו" }).click();
  await lightingCard.getByPlaceholder(PROJECT_CONSTRAINTS.HEIGHT_PLACEHOLDER).fill("40.5");
  await lightingCard.getByRole("button", { name: "שמור הנמכה" }).click();
  await expect(lightingCard.getByText("שונה בדירה", { exact: true })).toBeVisible();
  await expect(lightingCard.getByText("40.5 ס״מ", { exact: true })).toBeVisible();
  expect(await readLighting(api, first.id)).toMatchObject({
    hasOwnLighting: true,
    generalLightingCeilingLoweringHeight: 40.5,
  });
  expect(await readLighting(api, building.id)).toMatchObject({
    generalLightingCeilingLoweringHeight: 30,
  });
  expect(await readLighting(api, neighbor.id)).toMatchObject({
    hasOwnLighting: false,
    generalLightingCeilingLoweringHeight: 30,
  });

  await setBuildingLighting(api, building.id, 35);
  await page.reload();
  await expect(lightingCard.getByText("40.5 ס״מ", { exact: true })).toBeVisible();
  expect(await readLighting(api, neighbor.id)).toMatchObject({
    generalLightingCeilingLoweringHeight: 35,
  });
  await lightingCard.getByRole("button", { name: "שנה לדירה זו" }).click();
  await lightingCard.getByRole("switch", { name: "הנמכה כללית לתאורה" }).click();
  await expect(lightingCard.getByPlaceholder(PROJECT_CONSTRAINTS.HEIGHT_PLACEHOLDER)).toHaveCount(
    0,
  );
  await lightingCard.getByRole("button", { name: "שמור הנמכה" }).click();
  await expect(lightingCard.getByText("אין הנמכה כללית", { exact: true })).toBeVisible();
  expect(await readLighting(api, first.id)).toMatchObject({
    hasOwnLighting: true,
    hasGeneralLightingCeilingLowering: false,
    generalLightingCeilingLoweringHeight: null,
  });
  await lightingCard.getByRole("button", { name: "חזור לערך הבניין" }).click();
  await expect(lightingCard.getByText("מפרויקט האב", { exact: true })).toBeVisible();
  await expect(lightingCard.getByText("35 ס״מ", { exact: true })).toBeVisible();
  expect(await readLighting(api, first.id)).toMatchObject({
    hasOwnLighting: false,
    generalLightingCeilingLoweringHeight: 35,
  });
});

test("apartment creation shows inherited lowering, validates centimeters, and saves a local value", async ({
  page,
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  await setBuildingLighting(api, building.id, 25);
  const customer = await seedCustomer(api);
  const number = createApartmentNumber();
  const projectPage = createProjectPage(page);
  const form = createApartmentFormPage(page);

  await projectPage.goto(building.id);
  await projectPage.addApartmentButton.click();
  await form.fill({ floor: "4", number, customerName: customer.name });
  const lightingCard = page
    .getByText("הנמכה כללית לתאורה", { exact: true })
    .first()
    .locator("xpath=ancestor::section[1]");
  await expect(lightingCard.getByText("מפרויקט האב", { exact: true })).toBeVisible();
  await expect(lightingCard.getByText("25 ס״מ", { exact: true })).toBeVisible();
  await lightingCard.getByRole("button", { name: "שנה לדירה זו" }).click();
  const height = lightingCard.getByPlaceholder(PROJECT_CONSTRAINTS.HEIGHT_PLACEHOLDER);
  await height.fill("abc");
  await expect(page.getByText(PROJECT_CONSTRAINTS.HEIGHT_INVALID, { exact: true })).toBeVisible();
  await form.submitButton.click();
  await expect(page).not.toHaveURL(new RegExp(`/projects/${building.id}$`));
  await height.fill("30");
  await form.submitButton.click();
  await expect(page).toHaveURL(new RegExp(`/projects/${building.id}$`));

  const apartments = await readBuildingApartments(api, building.id);
  expect(apartments).toHaveLength(1);
  expect(await readLighting(api, apartments[0].id)).toMatchObject({
    hasOwnLighting: true,
    hasGeneralLightingCeilingLowering: true,
    generalLightingCeilingLoweringHeight: 30,
  });
});

test("apartment API rejects missing or malformed lowering heights and clears a disabled local height", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const customer = await seedCustomer(api);
  const base = {
    customerId: customer.id,
    customerFloor: 4,
    customerApartment: createApartmentNumber(),
  };
  const path = `/project/${building.id}/apartments`;
  for (const height of [undefined, null, "25", -1]) {
    const response = await api.send(HTTP_METHODS.POST, path, {
      ...base,
      customerApartment: createApartmentNumber(),
      hasOwnLighting: true,
      hasGeneralLightingCeilingLowering: true,
      generalLightingCeilingLoweringHeight: height,
    });
    expect(response.status()).toBe(400);
  }
  const apartment = await api.createApartment(building.id, {
    ...base,
    hasOwnLighting: true,
    hasGeneralLightingCeilingLowering: true,
    generalLightingCeilingLoweringHeight: 20,
  });
  const response = await api.send(HTTP_METHODS.PATCH, `/project/${apartment.id}`, {
    hasGeneralLightingCeilingLowering: false,
  });
  expect(response.ok()).toBe(true);
  expect(await readLighting(api, apartment.id)).toMatchObject({
    hasOwnLighting: true,
    hasGeneralLightingCeilingLowering: false,
    generalLightingCeilingLoweringHeight: null,
  });
});
