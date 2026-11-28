import type { Locator } from "@playwright/test";
import { createQuotation } from "../../src/api/quotation.api.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { HTTP_METHODS, HTTP_STATUS } from "../../src/constants/http.constant.ts";

const cardAppearance = (card: Locator, title: string) =>
  Promise.all([
    card.evaluate(element => {
      const style = getComputedStyle(element);
      return [
        style.border,
        style.borderRadius,
        style.boxShadow,
        style.padding,
        style.backgroundColor,
        style.overflowWrap,
      ];
    }),
    card.getByText(title, { exact: true }).evaluate(element => {
      const style = getComputedStyle(element);
      return [style.fontSize, style.fontWeight, style.color];
    }),
    card.getByText("טיוטה", { exact: true }).evaluate(element => {
      const style = getComputedStyle(element);
      const dot = getComputedStyle(element, "::before");
      return [
        style.border,
        style.borderRadius,
        style.padding,
        style.backgroundColor,
        style.fontSize,
        style.fontWeight,
        dot.width,
        dot.backgroundColor,
      ];
    }),
  ]);

test("Project estimate cards match quotation surfaces, typography, badges and responsive columns", async ({
  api,
  page,
}, testInfo) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const quotation = await createQuotation(api, customer.id, project.id);
  await createQuotation(api, customer.id, project.id);
  const names = ["מיזוג קומת קרקע", "מיזוג קומה ראשונה"];
  for (const name of names) {
    const created = await api.send(HTTP_METHODS.POST, "/engineering-estimates", {
      projectId: project.id,
      name,
    });
    expect(created.status()).toBe(HTTP_STATUS.CREATED);
  }
  await page.goto(`/projects/${project.id}`);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "הצעות מחיר", exact: true }).click();
    const quotes = page.getByRole("tabpanel", { name: "הצעות מחיר", exact: true });
    const reference = quotes.getByRole("region", {
      name: `${quotation.number} · ${customer.name} · טיוטה`,
      exact: true,
    });
    await expect(reference).toBeVisible();
    await reference.scrollIntoViewIfNeeded();
    const appearance = await cardAppearance(reference, quotation.number);
    const referenceWidth = await reference.evaluate(
      element => element.getBoundingClientRect().width,
    );
    await testInfo.attach(`quotation-cards-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    await page.getByRole("tab", { name: "כתבי כמויות", exact: true }).click();
    const estimates = page.getByRole("tabpanel", { name: "כתבי כמויות", exact: true });
    const card = estimates.getByRole("region", { name: `${names[0]} · טיוטה`, exact: true });
    await expect(card).toBeVisible();
    await expect(card).toHaveText(`${names[0]}טיוטה`);
    await expect(
      card.getByRole("button", { name: `${names[0]} · טיוטה`, exact: true }),
    ).toBeVisible();
    expect(await cardAppearance(card, names[0])).toEqual(appearance);
    const width = await card.evaluate(element => element.getBoundingClientRect().width);
    expect(Math.abs(width - referenceWidth)).toBeLessThan(2);
    const second = estimates.getByRole("region", { name: `${names[1]} · טיוטה`, exact: true });
    const top = await card.evaluate(element => element.getBoundingClientRect().top);
    const secondTop = await second.evaluate(element => element.getBoundingClientRect().top);
    expect(Math.abs(top - secondTop) < 2).toBe(viewport.width > 390);
    await card.scrollIntoViewIfNeeded();
    await testInfo.attach(`estimate-cards-${viewport.width}`, {
      body: await page.screenshot(),
      contentType: "image/png",
    });
    if (viewport.width > 390) {
      const open = card.getByRole("button");
      await open.focus();
      await expect(open).toBeFocused();
      await open.press("Enter");
    } else {
      await card.getByText(names[0], { exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: names[0], exact: true })).toBeVisible();
    await page.getByRole("button", { name: "חזרה לכתבי הכמויות בפרויקט", exact: true }).click();
    await expect(card).toBeVisible();
  }
});
