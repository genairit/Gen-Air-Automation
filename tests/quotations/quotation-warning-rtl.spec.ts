import {
  warningMessage,
  expectLatinWordOrder,
  expectWarningGeometry,
} from "../../src/utilities/quotation-warning.utility.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { quotationDocument } from "../../src/api/quotation.api.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createQuotationPage } from "../../src/pages/quotation.page.ts";
import { KEYBOARD_KEYS } from "../../src/constants/keyboard.constant.ts";
import { PERMISSIONS } from "../../src/constants/permission.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { seedQuotationWarnings } from "../../src/api/quotation-design-fixture.ts";
import { QUOTATION_PERMISSIONS } from "../../src/constants/quotation.constant.ts";
import { LIFECYCLE_COPY } from "../../src/constants/quotation-lifecycle.constant.ts";

const LONG_IDENTIFIER =
  "E-SMD-63/AC123-LG-VRF-PRO-24000BTU-1200CFM-30PCT-1TO1-ALPHA-BETA-GAMMA-DELTA-182";
const VISUAL_TEXT = [
  "התראה קצרה.",
  `LG VRF PRO יחידה ללא בקר: E-SMD-63/AC123, נדרש 24,000 BTU וגם 1,200 CFM; תשלום 30%, יחס 1:0.5–1:1.3.\nפרטים מורחבים: יש לבדוק את ההתקנה במערכת לפני אישור ההצעה, לשמור על כל סימני הפיסוק ולוודא שהטקסט הארוך נשאר קריא גם במסך צר.\nמזהה ארוך: ${LONG_IDENTIFIER}.`,
] as const;
const readQuotation = async (
  api: Parameters<typeof seedQuotationWarnings>[0],
  id: string,
): ReturnType<typeof quotationDocument> =>
  quotationDocument(await api.send(HTTP_METHODS.GET, `/quotation/${id}`));

// Only warning copy is replaced; this visual test does not prove server rule or approval behavior.
test("warning copy preserves multiline Hebrew and complete Latin runs across widths and doubled text", async ({
  page,
  api,
}, testInfo) => {
  const { quotation } = await seedQuotationWarnings(api);
  const quote = createQuotationPage(page);
  await quote.goto(quotation.id);
  await quote.transition("סיימתי, לבדיקה");
  const savedDocument = await readQuotation(api, quotation.id);
  expect(savedDocument.warnings.length).toBeGreaterThanOrEqual(VISUAL_TEXT.length);
  await page.route(
    url => [`/quotation/${quotation.id}`, `/api/quotation/${quotation.id}`].includes(url.pathname),
    async route => {
      if (route.request().method() !== HTTP_METHODS.GET) {
        await route.continue();
        return;
      }

      await route.fulfill({
        json: {
          ...savedDocument,
          warnings: savedDocument.warnings
            .slice(0, VISUAL_TEXT.length)
            .map((warning, index) => ({ ...warning, text: VISUAL_TEXT[index] })),
        },
      });
    },
  );
  await page.reload();
  const controls = page.getByRole("checkbox");
  await expect(controls).toHaveCount(VISUAL_TEXT.length);
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const [index, text] of VISUAL_TEXT.entries()) {
      const checkbox = controls.nth(index);
      await expect(warningMessage(checkbox)).toHaveText(text);
      expect(await warningMessage(checkbox).textContent()).toBe(text);
      await expectWarningGeometry(checkbox);
    }
    await expectLatinWordOrder(warningMessage(controls.nth(1)), ["LG", "VRF", "PRO"]);
    await expectLatinWordOrder(warningMessage(controls.nth(1)), ["24,000", "BTU"]);
    await expectLatinWordOrder(warningMessage(controls.nth(1)), ["1,200", "CFM"]);
    expect(await warningMessage(controls.nth(1)).locator("bdi").allTextContents()).toEqual(
      expect.arrayContaining([
        "LG VRF PRO",
        "E-SMD-63/AC123",
        "24,000 BTU",
        "1,200 CFM",
        "30%",
        "1:0.5–1:1.3",
      ]),
    );
    for (const run of ["E-SMD-63/AC123", "24,000 BTU", "1,200 CFM", "30%", "1:0.5–1:1.3"]) {
      await expect(warningMessage(controls.nth(1)).getByText(run, { exact: true })).toHaveCount(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const identifier = warningMessage(controls.nth(1))
      .locator("bdi")
      .filter({ hasText: LONG_IDENTIFIER });
    await expect(identifier).toHaveText(LONG_IDENTIFIER);
    if (width === 390) {
      expect(await identifier.evaluate(element => element.getClientRects().length)).toBeGreaterThan(
        1,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`warning-rtl-${width}.png`),
      fullPage: true,
    });
  }
  // CSS doubles the warning label's computed font size, exercising text reflow, not browser zoom.
  await controls.locator("xpath=ancestor::label").evaluateAll(labels => {
    for (const label of labels) {
      const text = label.querySelector(".MuiFormControlLabel-label");
      if (!(text instanceof HTMLElement)) {
        throw new Error("Missing warning text for doubled-font reflow");
      }

      const originalSize = parseFloat(getComputedStyle(text).fontSize);
      text.style.fontSize = `${originalSize * 2}px`;
      if (parseFloat(getComputedStyle(text).fontSize) !== originalSize * 2) {
        throw new Error("Warning text scaling was not applied");
      }
    }
  });
  for (const checkbox of await controls.all()) {
    await expectWarningGeometry(checkbox);
  }
  await expectLatinWordOrder(warningMessage(controls.nth(1)), ["LG", "VRF", "PRO"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const enlargedIdentifier = warningMessage(controls.nth(1))
    .locator("bdi")
    .filter({ hasText: LONG_IDENTIFIER });
  await expect(enlargedIdentifier).toHaveText(LONG_IDENTIFIER);
  expect(
    await enlargedIdentifier.evaluate(element => element.getClientRects().length),
  ).toBeGreaterThan(1);
  await page.screenshot({
    path: testInfo.outputPath("warning-rtl-390-double-text.png"),
    fullPage: true,
  });
});

test("real multiple rules retain keys after acknowledgement failure, pending keyboard interaction and reload", async ({
  page,
  api,
  openPageAs,
}) => {
  const { quotation } = await seedQuotationWarnings(api);
  const quote = createQuotationPage(page);
  await quote.goto(quotation.id);
  await expect(page.getByText(/מעגל קומה 3 · A · יחס/)).toHaveCSS("direction", "rtl");
  await quote.transition("סיימתי, לבדיקה");
  const before = await readQuotation(api, quotation.id);
  expect(before.warnings.length).toBeGreaterThan(1);
  const firstWarning = before.warnings[0] ?? null;
  if (!firstWarning) {
    throw new Error("Missing first server warning");
  }

  const controls = page.getByRole("checkbox");
  await expect(controls).toHaveCount(before.warnings.length);
  await expect(quote.button("אישור ההצעה")).toBeDisabled();
  await withRolePermissions(
    USER_ROLES.ENGINEER,
    [QUOTATION_PERMISSIONS.READ, PERMISSIONS.CUSTOMERS_READ, PERMISSIONS.PROJECTS_READ],
    async () => {
      const reader = await openPageAs(TEST_USERS[USER_ROLES.ENGINEER]);
      await createQuotationPage(reader).goto(quotation.id);
      for (const checkbox of await reader.getByRole("checkbox").all()) {
        await expect(checkbox).toBeDisabled();
      }
      await reader.close();
    },
  );
  await page.route(`**/quotation/${quotation.id}/warnings`, route =>
    route.abort("connectionfailed"),
  );
  await controls.first().locator("xpath=ancestor::label").click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("alert").locator('[dir="rtl"]')).toHaveCSS("direction", "rtl");
  await expect(controls.first()).not.toBeChecked();
  expect((await readQuotation(api, quotation.id)).warnings).toEqual(before.warnings);
  await page.unroute(`**/quotation/${quotation.id}/warnings`);
  await quote.button(LIFECYCLE_COPY.RELOAD).click();
  await expect(controls.first()).toBeEnabled();
  expect((await readQuotation(api, quotation.id)).warnings).toEqual(before.warnings);
  const release = { resolve: () => {} };
  const gate = new Promise<void>(resolve => {
    release.resolve = resolve;
  });
  await page.route(`**/quotation/${quotation.id}/warnings`, async route => {
    expect(route.request().postDataJSON()).toMatchObject({
      warningKeys: [firstWarning.key],
    });
    await gate;
    await route.continue();
  });
  await controls.first().focus();
  await page.keyboard.press(KEYBOARD_KEYS.TAB);
  await expect(controls.nth(1)).toBeFocused();
  await page.keyboard.press(`${KEYBOARD_KEYS.SHIFT}+${KEYBOARD_KEYS.TAB}`);
  await expect(controls.first()).toBeFocused();
  await page.keyboard.press(KEYBOARD_KEYS.SPACE);
  try {
    for (const checkbox of await controls.all()) {
      await expect(checkbox).toBeDisabled();
    }
  } finally {
    release.resolve();
  }
  await expect(controls.first()).toBeChecked();
  await page.unroute(`**/quotation/${quotation.id}/warnings`);
  await page.reload();
  await expect(controls.first()).toBeChecked();
  const reloaded = await readQuotation(api, quotation.id);
  expect(reloaded.warnings.map(warning => warning.key)).toEqual(
    before.warnings.map(warning => warning.key),
  );
  expect(reloaded.sections).toEqual(before.sections);
  await quote.acknowledge();
  await quote.transition("אישור ההצעה");
});
