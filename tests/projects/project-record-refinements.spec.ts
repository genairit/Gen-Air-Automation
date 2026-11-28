import {
  seedCustomer,
  seedBuilding,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import { randomUUID } from "node:crypto";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { QUOTATION } from "../../src/constants/quotation.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { mockDriveManagement } from "../../src/mocks/drive-management.mock.ts";
import { openWorkspaceTab } from "../../src/pages/project-workspace.component.ts";
import { createCatalogueFixture } from "../../src/environment/quotation-fixtures.ts";
import { buildProjectRoute, buildApartmentRoute } from "../../src/utilities/route.utility.ts";
import { createQuotation, quotationWrite, saveQuotation } from "../../src/api/quotation.api.ts";

for (const kind of ["standalone", "building", "apartment"] as const) {
  for (const width of [1280, 390]) {
    test(`${kind} record details belong to the upper card and document actions stay scoped at ${width}px`, async ({
      page,
      api,
    }, info) => {
      await page.setViewportSize({ width, height: 800 });
      const customer = await seedCustomer(api);
      const parent =
        kind === "standalone"
          ? await seedStandaloneProject(api, customer)
          : await seedBuilding(api, customer);
      const project = kind === "apartment" ? await seedApartment(api, parent) : parent;
      const stored = await (await api.send(HTTP_METHODS.GET, `/project/${project.id}`)).json();
      await mockDriveManagement(page, project.id);
      const path =
        kind === "apartment"
          ? buildApartmentRoute(parent.id, project.id)
          : buildProjectRoute(project.id);
      const name = `כתב כמויות לבדיקה ${kind} ${width}`;
      const created = await api.send(HTTP_METHODS.POST, "/engineering-estimates", {
        name,
        projectId: project.id,
      });
      expect(created.status()).toBe(201);
      const estimate = await created.json();
      const listed = await api.send(
        HTTP_METHODS.GET,
        `/engineering-estimates?projectId=${project.id}`,
      );
      expect(listed.ok()).toBe(true);
      const list = await listed.json();
      const metadata = list.items.find((item: { id: string }) => item.id === estimate.id);
      expect(metadata.updatedAt).toEqual(expect.any(String));
      await page.goto(path);
      await expect(page.getByRole("tab", { name: "פרטים", exact: true })).toHaveCount(0);
      const heading = page.getByRole("heading", {
        name:
          kind === "apartment"
            ? `דירה ${stored.customerApartment} · קומה ${stored.customerFloor}`
            : project.name,
        exact: true,
      });
      await expect(heading).toBeVisible();
      const upper = heading.locator("xpath=ancestor::section[1]");
      await expect(upper.locator("dl")).toContainText(stored.projectType.name);
      await expect(upper.locator("dl")).toContainText(stored.address);
      const disclosure = upper.locator("summary").filter({ hasText: /^פרטים נוספים$/ });
      await expect(disclosure).toBeVisible();
      await disclosure.click();
      await expect(upper.locator("details")).toHaveAttribute("open", "");
      await page.screenshot({ path: info.outputPath(`expanded-details-${kind}-${width}.png`) });
      await disclosure.click();
      await expect(upper.locator("details")).not.toHaveAttribute("open", "");
      await openWorkspaceTab(page, "people");
      if (width === 390) await page.getByRole("button", { name: "אנשי קשר", exact: true }).click();
      await expect(page.getByRole("button", { name: "שייך יועץ", exact: true })).toBeEnabled();
      for (const title of ["אדריכל", "מנהל פרויקט", "יועץ"]) {
        await expect(page.getByText(title, { exact: true })).toBeVisible();
        if (width === 1280)
          await expect(page.getByText(title, { exact: true })).toBeInViewport({ ratio: 1 });
      }
      await page.screenshot({ path: info.outputPath(`people-${kind}-${width}.png`) });
      await page.getByRole("tab", { name: "כתבי כמויות", exact: true }).click();
      const card = page.getByRole("region", { name: `${name} · טיוטה`, exact: true });
      await expect(card.getByRole("heading", { name, exact: true })).toBeVisible();
      await expect(card.locator("time")).toHaveAttribute("datetime", metadata.updatedAt);
      await expect(card).toContainText("פתח כתב כמויות");
      await page.screenshot({ path: info.outputPath(`estimate-card-${kind}-${width}.png`) });
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/engineering-estimates\\?estimate=${estimate.id}$`));
      await page.goto(`${path}?tab=purchase`);
      await page.getByRole("button", { name: "יצירת כתב רכש", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/project-boqs/${project.id}$`));
      await expect(
        page.getByRole("heading", { name: `כתב רכש · ${project.name}`, exact: true }),
      ).toBeVisible();
    });
  }
}

for (const width of [1440, 390]) {
  test(`quotation rows have comfortable RTL inset before and after adding catalogue items at ${width}px`, async ({
    page,
    api,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const customer = await seedCustomer(api);
    const initial = await createQuotation(api, customer.id);
    const editor = createQuotationPage(page);
    await editor.goto(initial.id);
    const region = page.getByRole("region", { name: "מערכות ושורות", exact: true });
    const assertInset = async () => {
      const heading = region.getByRole("heading", { name: "מערכות ושורות", exact: true });
      await expect(heading).toBeVisible();
      const outer = await region.boundingBox(),
        inner = await heading.boundingBox();
      if (!outer || !inner) throw new Error("Quotation heading geometry unavailable");
      expect(outer.x + outer.width - (inner.x + inner.width)).toBeGreaterThanOrEqual(
        width < 600 ? 12 : 16,
      );
      for (const cell of await region.locator("thead th").all()) {
        expect(
          await cell.evaluate(el => parseFloat(getComputedStyle(el).paddingInlineStart)),
        ).toBeGreaterThanOrEqual(width < 600 ? 4 : 8);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    };
    await assertInset();
    const item = await createCatalogueFixture({ description: "פריט בדיקת ריווח", price: "250" });
    await saveQuotation(api, initial.id, {
      ...quotationWrite(initial),
      brand: QUOTATION.BRAND,
      sections: [
        {
          id: randomUUID(),
          title: "מערכת בדיקת ריווח",
          systemType: QUOTATION.SYSTEM.SINGLE,
          brand: QUOTATION.BRAND,
          items: [
            {
              id: randomUUID(),
              catalogueItemId: item.id,
              parentItemId: null,
              description: item.description,
              quotedPrice: "250",
              quantity: "2",
              location: "לובי",
              circuit: null,
              requestedCapacityBtu: null,
            },
          ],
        },
      ],
    });
    await page.reload();
    await expect(region).toContainText(item.description);
    await expect(region).toContainText("מערכת בדיקת ריווח");
    await assertInset();
    await region.screenshot({ path: info.outputPath(`quotation-padding-${width}.png`) });
  });
}
