import {
  PAYMENT_TERMS,
  CONTACT_ROLES,
  PROJECT_TYPE_NAMES,
  PAYMENT_TERMS_LABELS,
} from "../../src/constants/domain.constant.ts";

import type { Page } from "@playwright/test";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { PROJECT_FORM_COPY } from "../../src/constants/copy.constant.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { LOCAL_STORAGE_KEYS } from "../../src/constants/storage.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { buildEditProjectRoute } from "../../src/utilities/route.utility.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { createUniqueName, createMobilePhone } from "../../src/utilities/test-data.utility.ts";

const CONTACT_NAME = "יוסי לוי";

const readDraft = async (page: Page, userId: string): Promise<string | null> =>
  page.evaluate(
    key => localStorage.getItem(key),
    `${LOCAL_STORAGE_KEYS.PROJECT_FORM_DRAFT}:${userId}`,
  );

test("pending address verification preserves later form changes and successful creation clears the draft", async ({
  page,
  api,
  request,
}) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  const name = createUniqueName("פרויקט עם אימות מושהה");
  const phone = createMobilePhone();
  const verification = createDeferred();
  const intercepted = createDeferred();

  await page.route("**/address/places/**", async route => {
    intercepted.resolve();
    await verification.promise;
    await route.continue();
  });

  try {
    await form.goto();
    await form.fill({
      name,
      place: FAKE_PLACES[1],
      customerName: customer.name,
      contactPhone: phone,
      contactName: CONTACT_NAME,
      contactRole: CONTACT_ROLES.ENGINEER,
      projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
      paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
    });
    await intercepted.promise;
    await expect(form.addressVerified).toHaveCount(0);
    await expect(form.contactNameInput).toHaveValue(CONTACT_NAME);
    await expect(form.contactPhoneInput).toHaveValue(phone);

    verification.resolve();
    await expect(form.addressVerified).toBeVisible();
    await expect(form.contactNameInput).toHaveValue(CONTACT_NAME);
    await expect(form.contactPhoneInput).toHaveValue(phone);
    await expect(
      page.getByRole("radio", { name: PAYMENT_TERMS_LABELS.MILESTONES_NET_60 }),
    ).toBeChecked();
    await form.createButton.click();
    await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
    await expect(page.getByRole("heading", { name })).toBeVisible();

    const id = new URL(page.url()).pathname.split("/").at(-1);
    const response = await request.get(`${URLS.BACKEND}${API_PATHS.PROJECT}/${id}`, {
      headers: { Authorization: `Bearer ${api.session.accessToken}` },
    });
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({
      name,
      contactName: CONTACT_NAME,
      contactPhone: phone,
      contactRole: CONTACT_ROLES.ENGINEER,
      customerId: customer.id,
      paymentTerms: PAYMENT_TERMS.MILESTONES_NET_60,
    });
    await expect.poll(() => readDraft(page, api.session.user.id)).toBeNull();
    await form.goto();
    await expect(form.nameInput).toHaveValue("");
  } finally {
    verification.resolve();
  }
});

test("draft reload restores allowed values, omits private details and discard remains cleared", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const form = createProjectFormPage(page);
  const name = createUniqueName("טיוטה מקומית");
  const phone = createMobilePhone();

  await form.goto();
  await form.fill({
    name,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    contactPhone: phone,
    contactName: CONTACT_NAME,
    contactRole: CONTACT_ROLES.ENGINEER,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });
  await expect(form.addressVerified).toBeVisible();
  await expect.poll(() => readDraft(page, api.session.user.id)).toContain(name);
  const draft = await readDraft(page, api.session.user.id);
  const projectType = await api.findProjectType(PROJECT_TYPE_NAMES.COMMERCIAL);
  expect(JSON.parse(draft ?? "null")).toMatchObject({
    values: { name, typeId: projectType.id, terms: PAYMENT_TERMS.MILESTONES_NET_60 },
  });
  expect(draft).not.toContain(CONTACT_NAME);
  expect(draft).not.toContain(phone);
  expect(draft).not.toContain(customer.name);
  expect(draft).not.toContain(FAKE_PLACES[1].placeId);

  await page.reload();
  await expect(page.getByText(PROJECT_FORM_COPY.DRAFT_RESTORED, { exact: true })).toBeVisible();
  await expect(form.nameInput).toHaveValue(name);
  await expect(
    page.getByRole("radio", { name: PAYMENT_TERMS_LABELS.MILESTONES_NET_60 }),
  ).toBeChecked();
  await expect(form.contactNameInput).toHaveValue("");
  await expect(form.contactPhoneInput).toHaveValue("");
  await expect(form.addressInput).toHaveValue("");
  await expect(form.customerSearch).toHaveValue("");

  await page.getByRole("button", { name: PROJECT_FORM_COPY.DISCARD_DRAFT }).click();
  await expect(form.nameInput).toHaveValue("");
  await expect.poll(() => readDraft(page, api.session.user.id)).toBeNull();
  await page.reload();
  await expect(form.nameInput).toHaveValue("");
  await expect(page.getByText(PROJECT_FORM_COPY.DRAFT_RESTORED, { exact: true })).toHaveCount(0);
});

test("editing an existing project cannot overwrite the new-project draft", async ({
  page,
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const form = createProjectFormPage(page);
  const name = createUniqueName("טיוטה שמורה");
  await form.goto();
  await form.nameInput.fill(name);
  await expect.poll(() => readDraft(page, api.session.user.id)).toContain(name);
  const draft = await readDraft(page, api.session.user.id);
  await page.goto(buildEditProjectRoute(project.id));
  await expect(form.nameInput).toHaveValue(project.name);
  await form.nameInput.fill(createUniqueName("עריכת פרויקט"));
  expect(await readDraft(page, api.session.user.id)).toBe(draft);
  await form.goto();
  await expect(form.nameInput).toHaveValue(name);
});
