import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { SEED_VALUES } from "../../src/constants/seed.constant.ts";
import { readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { PROJECT_TYPE_NAMES } from "../../src/constants/domain.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { seedCustomer, buildStandaloneProjectInput } from "../../src/api/seed-data.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { FAKE_PLACES, SERVICE_AREA_PLACES } from "../../src/constants/fake-places.constant.ts";

const ADDRESS_PATHS = {
  SUGGESTIONS: "/address/suggestions",
  PLACES: "/address/places",
} as const;

for (const place of [
  SERVICE_AREA_PLACES.ALMON,
  SERVICE_AREA_PLACES.ANATOT,
  SERVICE_AREA_PLACES.JERUSALEM_PARAN,
  FAKE_PLACES[0],
]) {
  test(`verified ${place.mainText} selection creates and retains the project address`, async ({
    page,
    api,
  }) => {
    const customer = await seedCustomer(api);
    const form = createProjectFormPage(page);
    const name = createUniqueName("כתובת שירות");
    await form.goto();
    await form.fill({
      name,
      place,
      customerName: customer.name,
      projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    });
    await expect(form.addressVerified).toBeVisible();
    await expect(form.addressInput).toHaveValue(place.formattedAddress);
    const created = page.waitForResponse(
      response =>
        response.request().method() === HTTP_METHODS.POST &&
        response.url().endsWith(API_PATHS.PROJECT),
    );
    await form.createButton.click();
    expect((await created).status()).toBe(HTTP_STATUS.CREATED);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    const id = readLastPathSegment(page.url());
    const stored = await api.send(HTTP_METHODS.GET, `${API_PATHS.PROJECT}/${id}`);
    expect(stored.status()).toBe(HTTP_STATUS.OK);
    expect(await stored.json()).toMatchObject({
      address: place.formattedAddress,
      addressCity: place.city,
      addressPlaceId: place.placeId,
    });
    await page.reload();
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    const reloaded = await api.send(HTTP_METHODS.GET, `${API_PATHS.PROJECT}/${id}`);
    expect(await reloaded.json()).toMatchObject({
      address: place.formattedAddress,
      addressCity: place.city,
      addressPlaceId: place.placeId,
    });
  });
}

test("autocomplete includes both supported regions and omits unsupported provider results", async ({
  api,
}) => {
  const response = await api.send(
    HTTP_METHODS.GET,
    `${ADDRESS_PATHS.SUGGESTIONS}?${new URLSearchParams({ input: "עלמון" })}`,
  );
  expect(response.status()).toBe(HTTP_STATUS.OK);
  const body: unknown = await response.json();
  expect(body).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ placeId: SERVICE_AREA_PLACES.ALMON.placeId }),
      expect.objectContaining({ placeId: SERVICE_AREA_PLACES.ANATOT.placeId }),
      expect.objectContaining({ placeId: FAKE_PLACES[0].placeId }),
    ]),
  );
  expect(body).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ placeId: SERVICE_AREA_PLACES.UNSUPPORTED.placeId }),
    ]),
  );
});

for (const place of [SERVICE_AREA_PLACES.UNSUPPORTED, SERVICE_AREA_PLACES.NO_COUNTRY]) {
  test(`country verification rejects ${place.placeId} for lookup and project persistence`, async ({
    api,
  }) => {
    const customer = await seedCustomer(api);
    const input = await buildStandaloneProjectInput(api, customer);
    const lookup = await api.send(HTTP_METHODS.GET, `${ADDRESS_PATHS.PLACES}/${place.placeId}`);
    expect(lookup.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await lookup.json()).toMatchObject({
      message: "Selected place is outside the supported service area; choose another address",
    });
    const creation = await api.send(HTTP_METHODS.POST, API_PATHS.PROJECT, {
      ...input,
      addressPlaceId: place.placeId,
    });
    expect(creation.status()).toBe(HTTP_STATUS.BAD_REQUEST);
    expect(await creation.json()).toMatchObject({
      message: "Selected place is outside the supported service area; choose another address",
    });
    const list = await api.send(
      HTTP_METHODS.GET,
      `${API_PATHS.PROJECT}?${new URLSearchParams({ search: input.name })}`,
    );
    expect(await list.json()).toMatchObject({ items: [] });
  });
}

test("unknown places remain unverified and cannot be persisted", async ({ api }) => {
  const customer = await seedCustomer(api);
  const input = await buildStandaloneProjectInput(api, customer);
  const placeId = "fake_place_not_found";
  expect((await api.send(HTTP_METHODS.GET, `${ADDRESS_PATHS.PLACES}/${placeId}`)).status()).toBe(
    HTTP_STATUS.NOT_FOUND,
  );
  const response = await api.send(HTTP_METHODS.POST, API_PATHS.PROJECT, {
    ...input,
    addressPlaceId: placeId,
  });
  expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(await response.json()).toMatchObject({
    message: expect.stringContaining("could not be verified with Google"),
  });
});

test("supported-country roads still require a locality for private-client projects", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const input = await buildStandaloneProjectInput(api, customer);
  const privateType = await api.findProjectType(PROJECT_TYPE_NAMES.PRIVATE_CLIENT);
  const place = SERVICE_AREA_PLACES.NO_CITY;
  const lookup = await api.send(HTTP_METHODS.GET, `${ADDRESS_PATHS.PLACES}/${place.placeId}`);
  expect(lookup.status()).toBe(HTTP_STATUS.OK);
  expect(await lookup.json()).toMatchObject({ countryCode: "PS", city: null });
  const response = await api.send(HTTP_METHODS.POST, API_PATHS.PROJECT, {
    ...input,
    projectTypeId: privateType.id,
    customerFloor: SEED_VALUES.APARTMENT_FLOOR,
    customerApartment: createApartmentNumber(),
    addressPlaceId: place.placeId,
  });
  expect(response.status()).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(await response.json()).toMatchObject({
    message: "This project type needs an address within a city; pick a street address",
  });
});

test("the fake provider rejects malformed JSON, honors region lists and recovers for valid requests", async ({
  request,
}) => {
  const path = `${URLS.FAKE_PLACES}/places:autocomplete`;
  const invalid = await request.post(path, {
    data: Buffer.from("{"),
    headers: { "Content-Type": "application/json" },
  });
  expect(invalid.status()).toBe(HTTP_STATUS.BAD_REQUEST);
  expect(await invalid.json()).toMatchObject({ error: { status: "INVALID_ARGUMENT" } });
  for (const data of [{}, { includedRegionCodes: "il" }, { includedRegionCodes: [3] }]) {
    const response = await request.post(path, { data });
    expect(response.status()).toBe(HTTP_STATUS.OK);
    expect(await response.json()).toEqual({ suggestions: [] });
  }
  const supported = await request.post(path, { data: { includedRegionCodes: ["ps"] } });
  expect(supported.status()).toBe(HTTP_STATUS.OK);
  const body: unknown = await supported.json();
  expect(body).toMatchObject({
    suggestions: expect.arrayContaining([
      expect.objectContaining({
        placePrediction: expect.objectContaining({ placeId: SERVICE_AREA_PLACES.ALMON.placeId }),
      }),
      expect.objectContaining({
        placePrediction: expect.objectContaining({ placeId: SERVICE_AREA_PLACES.ANATOT.placeId }),
      }),
    ]),
  });
  expect(body).not.toMatchObject({
    suggestions: expect.arrayContaining([
      expect.objectContaining({
        placePrediction: expect.objectContaining({ placeId: FAKE_PLACES[0].placeId }),
      }),
    ]),
  });
});

test("typing text after selecting a verified address clears verification and blocks creation", async ({
  page,
  api,
}) => {
  const creations: string[] = [];
  page.on("request", request => {
    if (request.method() === HTTP_METHODS.POST && request.url().endsWith(API_PATHS.PROJECT)) {
      creations.push(request.url());
    }
  });
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  await form.goto();
  await form.fill({
    name: createUniqueName("כתובת לא מאומתת"),
    place: SERVICE_AREA_PLACES.ALMON,
    customerName: customer.name,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
  });
  await expect(form.addressVerified).toBeVisible();
  await form.addressInput.fill("כתובת ידנית שלא נבחרה");
  await form.addressInput.blur();
  await expect(form.addressVerified).toHaveCount(0);
  await form.createButton.click();
  await expect(page.getByText("לא הצלחנו לאמת את הכתובת שהוקלדה", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/projects\/new$/);
  expect(creations).toEqual([]);
});
