import { seedCustomer } from "../../src/api/seed-data.ts";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";

test("quotation status filters show only matching quotations", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const response = await api.send(HTTP_METHODS.POST, API_PATHS.QUOTATION, {
    customerId: customer.id,
  });

  expect(response.status()).toBe(HTTP_STATUS.CREATED);

  await page.goto(ROUTES.QUOTATIONS);

  const filters = page.getByRole("group", { name: "סינון הצעות מחיר" });
  const draft = filters.getByRole("button", { name: /טיוטה/ });
  const review = filters.getByRole("button", { name: /בבדיקה/ });
  const quotation = page.getByRole("button", { name: new RegExp(customer.name) });

  await expect(quotation).toBeVisible();
  await review.click();
  await expect(review).toHaveAttribute("aria-pressed", "true");
  await expect(quotation).toHaveCount(0);

  await draft.click();
  await expect(draft).toHaveAttribute("aria-pressed", "true");
  await expect(quotation).toBeVisible();
});
