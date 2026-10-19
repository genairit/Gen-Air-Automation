import {
  failNextCustomerCreation,
  CUSTOMER_CREATION_FAILURE,
} from "../../src/mocks/customer.mock.ts";

import {
  readBoundingBox,
  isWithinViewportWidth,
  readHorizontalOverflow,
} from "../../src/pages/layout.component.ts";

import {
  CUSTOMERS_COPY,
  CUSTOMER_FORM_COPY,
  CUSTOMER_FIELD_HINTS,
  CUSTOMER_FIELD_NAMES,
  CUSTOMER_TYPE_LABELS,
  type CustomerFieldType,
  CUSTOMER_SUMMARY_LABELS,
  CUSTOMER_SUMMARY_VALUES,
  CUSTOMER_FIELD_PLACEHOLDERS,
  CUSTOMER_CONTACT_FIELD_NAMES,
  CUSTOMER_IDENTITY_FIELD_NAMES,
} from "../../src/constants/copy.constant.ts";

import type { Page, Locator, Request } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { readTabCount } from "../../src/pages/tab.component.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { VIEWPORTS } from "../../src/constants/viewport.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { expectSingleResultRow } from "../../src/pages/table.component.ts";
import { formatFieldErrorCount } from "../../src/utilities/copy.utility.ts";
import { getAuthStatePath } from "../../src/utilities/auth-state.utility.ts";
import { seedCustomer, buildCustomerInput } from "../../src/api/seed-data.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../../src/constants/api.constant.ts";
import type { TCustomerFormInput } from "../../src/interfaces/customer-form.interface.ts";
import { buildCustomerRoute, readLastPathSegment } from "../../src/utilities/route.utility.ts";
import { createCustomersPage, createCustomerFormPage } from "../../src/pages/customers.page.ts";
import { CUSTOMER_TYPES, CUSTOMER_SYNC_STATUSES } from "../../src/constants/domain.constant.ts";

const INVALID_TAX_ID = "123456789";

const MAX_HEADER_BUTTON_WIDTH_RATIO = 0.5;

const CUSTOMER_CREATION_URL = `${API_PROXY_PREFIX}${API_PATHS.CUSTOMER}`;

const toFormInput = (customer: ReturnType<typeof buildCustomerInput>): TCustomerFormInput => ({
  NAME: customer.name,
  PHONE: customer.phone,
  EMAIL: customer.email,
  TAX_ID: customer.taxId,
  ADDRESS: customer.address,
  CONTACT_NAME: customer.contactName,
});

const mobileFormSections = (formPage: ReturnType<typeof createCustomerFormPage>) => [
  formPage.identityCard,
  formPage.contactCard,
  formPage.summaryCard,
  formPage.errorBanner,
  formPage.cancelButton,
  formPage.saveButton,
];

const isCustomerCreationRequest = (request: Request) => {
  const isPost = request.method() === HTTP_METHODS.POST;
  const isCustomerPath = new URL(request.url()).pathname === CUSTOMER_CREATION_URL;

  return isPost && isCustomerPath;
};

const expectCardFields = async (card: Locator, fieldNames: CustomerFieldType[]) => {
  await expect(card.getByRole("textbox")).toHaveCount(fieldNames.length);
  for (const name of fieldNames) {
    await expect(card.getByLabel(CUSTOMER_FORM_COPY.FIELDS[name], { exact: true })).toBeVisible();
  }
};

const recordCustomerCreationRequests = (page: Page) => {
  const requests: Request[] = [];

  page.on("request", request => {
    if (isCustomerCreationRequest(request)) {
      requests.push(request);
    }
  });

  return requests;
};

test("create a customer through the form and land on its page", async ({ page }) => {
  const customer = buildCustomerInput();
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill(toFormInput(customer));
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(customer.taxId)).toBeVisible();
});

test("the customer form refuses to save with an invalid field", async ({ page }) => {
  const customer = buildCustomerInput();
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill({ ...toFormInput(customer), TAX_ID: INVALID_TAX_ID });
  await formPage.saveButton.click();

  await expect(formPage.errorBanner).toHaveText(formatFieldErrorCount(1));
  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
});

test("the header new-customer button has the add icon, is not full width and opens the form", async ({
  page,
}) => {
  const customersPage = createCustomersPage(page);

  await customersPage.goto();

  await expect(customersPage.newCustomerButton).toBeVisible();
  await expect(customersPage.newCustomerIcon).toBeVisible();
  await expect(customersPage.managersOnlyCaption).toHaveCount(0);

  const buttonBox = await readBoundingBox(customersPage.newCustomerButton);
  const mainBox = await readBoundingBox(customersPage.main);
  const searchBox = await readBoundingBox(customersPage.searchBox);
  const headingBox = await readBoundingBox(customersPage.heading);
  const startsBeforeHeadingEnds = buttonBox.y < headingBox.y + headingBox.height;
  const endsAfterHeadingStarts = buttonBox.y + buttonBox.height > headingBox.y;

  expect(buttonBox.width).toBeLessThan(mainBox.width * MAX_HEADER_BUTTON_WIDTH_RATIO);
  expect(buttonBox.y + buttonBox.height).toBeLessThanOrEqual(searchBox.y);
  expect(startsBeforeHeadingEnds && endsAfterHeadingStarts).toBe(true);

  await customersPage.newCustomerButton.click();

  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
});

test("the new-customer form shows the approved identity, contact and summary cards", async ({
  page,
}) => {
  const formPage = createCustomerFormPage(page);
  const creatorName = formatFullName(TEST_USERS[USER_ROLES.SYSTEM_ADMIN]);

  await formPage.goto();

  await expect(formPage.eyebrow).toBeVisible();
  await expect(formPage.heading).toBeVisible();
  await expect(formPage.typeSelector).toHaveValue(CUSTOMER_TYPE_LABELS.COMPANY);
  await expectCardFields(formPage.identityCard, CUSTOMER_IDENTITY_FIELD_NAMES);
  await expectCardFields(formPage.contactCard, CUSTOMER_CONTACT_FIELD_NAMES);
  for (const name of CUSTOMER_FIELD_NAMES) {
    await expect(formPage.field(name)).toHaveAttribute(
      "placeholder",
      CUSTOMER_FIELD_PLACEHOLDERS[name],
    );
  }

  await expect(formPage.findFieldHint("TAX_ID", CUSTOMER_FIELD_HINTS.TAX_ID)).toBeVisible();
  await expect(formPage.findFieldHint("PHONE", CUSTOMER_FIELD_HINTS.PHONE)).toBeVisible();
  await expect(formPage.findSummaryTile(CUSTOMER_SUMMARY_LABELS.PRIORITY_ID)).toContainText(
    CUSTOMER_SUMMARY_VALUES.PRIORITY_ID,
  );
  await expect(formPage.findSummaryTile(CUSTOMER_SUMMARY_LABELS.CREATED_BY)).toContainText(
    creatorName,
  );
  await expect(formPage.findSummaryTile(CUSTOMER_SUMMARY_LABELS.SYNC_STATUS)).toContainText(
    CUSTOMER_SUMMARY_VALUES.SYNC_STATUS,
  );

  await formPage.typeSelector.click();

  for (const typeLabel of Object.values(CUSTOMER_TYPE_LABELS)) {
    await expect(page.getByRole("option", { name: typeLabel, exact: true })).toBeVisible();
  }
});

test("fields show no error on load and an empty save flags six fields without sending a request", async ({
  page,
}) => {
  const formPage = createCustomerFormPage(page);
  const creationRequests = recordCustomerCreationRequests(page);

  await formPage.goto();

  await expect(formPage.saveButton).toBeVisible();
  await expect(formPage.requiredErrors).toHaveCount(0);
  await expect(formPage.errorBanner).toHaveCount(0);

  await formPage.saveButton.click();

  await expect(formPage.errorBanner).toHaveText(formatFieldErrorCount(CUSTOMER_FIELD_NAMES.length));
  await expect(formPage.requiredErrors).toHaveCount(CUSTOMER_FIELD_NAMES.length);
  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
  expect(creationRequests).toHaveLength(0);
});

test("saving a private client creates a pending customer that the list shows as pending Priority", async ({
  page,
  api,
}) => {
  const customer = buildCustomerInput();
  const formPage = createCustomerFormPage(page);
  const customersPage = createCustomersPage(page);

  await formPage.goto();
  await formPage.chooseType(CUSTOMER_TYPE_LABELS.PRIVATE_CLIENT);
  await formPage.fill(toFormInput(customer));

  await expect(formPage.typeSelector).toHaveValue(CUSTOMER_TYPE_LABELS.PRIVATE_CLIENT);

  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();

  const savedCustomer = await api.getCustomer(readLastPathSegment(page.url()));

  expect(savedCustomer.taxId).toBe(customer.taxId);
  expect(savedCustomer.customerType).toBe(CUSTOMER_TYPES.PRIVATE_CLIENT);
  expect(savedCustomer.prioritySyncStatus).toBe(CUSTOMER_SYNC_STATUSES.PENDING);

  await customersPage.goto();
  await customersPage.searchBox.fill(customer.taxId);

  await expect(customersPage.findRow(customer.name)).toContainText(CUSTOMERS_COPY.PENDING_SYNC);
  await expectSingleResultRow(page);
});

test("a duplicate tax ID shows the conflict error and keeps the inputs", async ({ page, api }) => {
  const existingCustomer = await seedCustomer(api);
  const input = { ...toFormInput(buildCustomerInput()), TAX_ID: existingCustomer.taxId };
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill(input);
  const [creationResponse] = await Promise.all([
    page.waitForResponse(response => isCustomerCreationRequest(response.request())),
    formPage.saveButton.click(),
  ]);

  expect(creationResponse.status()).toBe(HTTP_STATUS.CONFLICT);
  await expect(formPage.errorBanner).toContainText(CUSTOMER_FORM_COPY.CONFLICT_STATUS);
  await expect(formPage.errorBanner).toContainText(CUSTOMER_FORM_COPY.DUPLICATE_TAX_ID);
  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
  for (const name of CUSTOMER_FIELD_NAMES) {
    await expect(formPage.field(name)).toHaveValue(input[name]);
  }
});

test("the action row reads cancel then save, and cancel returns to the customers list", async ({
  page,
}) => {
  const formPage = createCustomerFormPage(page);

  await formPage.goto();

  await expect(formPage.actionButtons).toHaveText([
    CUSTOMER_FORM_COPY.CANCEL,
    CUSTOMER_FORM_COPY.SAVE,
  ]);

  const cancelBox = await readBoundingBox(formPage.cancelButton);
  const saveBox = await readBoundingBox(formPage.saveButton);

  expect(cancelBox.x).toBeGreaterThan(saveBox.x);

  await formPage.cancelButton.click();

  await expect(page).toHaveURL(ROUTES.CUSTOMERS);
});

test("customers list counts a new customer as pending and finds it by search", async ({
  page,
  api,
}) => {
  const customersPage = createCustomersPage(page);
  const customer = await seedCustomer(api);
  const pendingCount = await api.countCustomersInSyncStatus(CUSTOMER_SYNC_STATUSES.PENDING);

  await customersPage.goto();

  await expect.poll(() => readTabCount(customersPage.pendingTab)).toBe(pendingCount);

  await customersPage.pendingTab.click();
  await customersPage.searchBox.fill(customer.taxId);

  await expect(customersPage.findRow(customer.name)).toBeVisible();
  await expectSingleResultRow(page);
});

test("customer page shows the details and the Priority sync status", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const customersPage = createCustomersPage(page);

  await customersPage.goto();
  await customersPage.searchBox.fill(customer.taxId);
  await customersPage.findRow(customer.name).click();

  await expect(page).toHaveURL(buildCustomerRoute(customer.id));
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(CUSTOMERS_COPY.DETAILS_TITLE)).toBeVisible();
  await expect(page.getByText(customer.contactName)).toBeVisible();
  await expect(page.getByText(CUSTOMERS_COPY.PENDING_SYNC)).not.toHaveCount(0);
});

test("a server failure preserves the customer form and retry persists the customer on its detail page", async ({
  page,
}) => {
  const customer = buildCustomerInput();
  const input = toFormInput(customer);
  const formPage = createCustomerFormPage(page);

  await formPage.goto();
  await formPage.fill(input);
  await failNextCustomerCreation(page);
  await formPage.saveButton.click();

  await expect(formPage.errorBanner).toBeVisible();
  await expect(formPage.errorBanner).toContainText(CUSTOMER_CREATION_FAILURE);
  await expect(page).toHaveURL(ROUTES.NEW_CUSTOMER);
  for (const name of CUSTOMER_FIELD_NAMES) {
    await expect(formPage.field(name)).toHaveValue(input[name]);
  }

  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(ROUTE_PATTERNS.CUSTOMER);
  await expect(page.getByRole("heading", { name: customer.name })).toBeVisible();
  await expect(page.getByText(customer.taxId)).toBeVisible();
  await expect(page.getByText(customer.contactName)).toBeVisible();
  await expect(page.getByText(customer.email)).toBeVisible();
});

test.describe("mobile layout", () => {
  test.use({ viewport: VIEWPORTS.MOBILE, isMobile: true, hasTouch: true });

  test("the customers page has no horizontal overflow at 390px", async ({ page }) => {
    const customersPage = createCustomersPage(page);

    await customersPage.goto();

    await expect(customersPage.newCustomerButton).toBeVisible();
    await expect.poll(() => readHorizontalOverflow(page)).toBeLessThanOrEqual(0);
    await expect
      .poll(() => isWithinViewportWidth(page, customersPage.newCustomerButton))
      .toBe(true);
  });

  test("the new-customer form has no horizontal overflow at 390px, before and after validation", async ({
    page,
  }) => {
    const formPage = createCustomerFormPage(page);

    await formPage.goto();

    await expect(formPage.saveButton).toBeVisible();
    await expect.poll(() => readHorizontalOverflow(page)).toBeLessThanOrEqual(0);

    await formPage.saveButton.click();

    await expect(formPage.errorBanner).toBeVisible();
    await expect.poll(() => readHorizontalOverflow(page)).toBeLessThanOrEqual(0);
    for (const section of mobileFormSections(formPage)) {
      await expect.poll(() => isWithinViewportWidth(page, section)).toBe(true);
    }
  });

  test.describe("without customer management", () => {
    test.use({ storageState: getAuthStatePath(USER_ROLES.INSTALLER) });

    test("the customers page caption has no horizontal overflow at 390px", async ({ page }) => {
      const customersPage = createCustomersPage(page);

      await customersPage.goto();

      await expect(customersPage.managersOnlyCaption).toBeVisible();
      await expect.poll(() => readHorizontalOverflow(page)).toBeLessThanOrEqual(0);
      await expect
        .poll(() => isWithinViewportWidth(page, customersPage.managersOnlyCaption))
        .toBe(true);
    });
  });
});
