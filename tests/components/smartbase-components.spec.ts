import { devices } from "@playwright/test";
import { ROUTES } from "../../src/constants/routes.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { createTaskFormPage } from "../../src/pages/tasks.page.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { TASK_FORM_COPY } from "../../src/constants/copy.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";

const { defaultBrowserType: _browserType, ...PHONE } = devices["Pixel 7"];

test("filter tabs move their blue selection and support keyboard navigation", async ({ page }) => {
  await page.goto(ROUTES.COMPONENTS);

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "תגיות, סטטוסים וטאבים" }),
  });
  const filters = section.getByRole("group").filter({
    has: page.getByRole("button", { name: "הכל 48" }),
  });
  const all = filters.getByRole("button", { name: "הכל 48" });
  const admins = filters.getByRole("button", { name: "מנהלי מערכת 4" });

  await expect(all).toHaveAttribute("aria-pressed", "true");
  await expect(all.locator('[aria-hidden="true"]')).toHaveCSS(
    "background-color",
    "rgb(225, 237, 250)",
  );

  await admins.click();

  await expect(admins).toHaveAttribute("aria-pressed", "true");
  await expect(all).toHaveAttribute("aria-pressed", "false");
  await expect(admins.locator('[aria-hidden="true"]')).toBeVisible();

  await admins.press("ArrowLeft");

  const secretaries = filters.getByRole("button", { name: "מזכירות 7" });

  await expect(secretaries).toHaveAttribute("aria-pressed", "true");
  await expect(secretaries).toBeFocused();
});

test("Smartbase selection controls update their visible state", async ({ page }) => {
  await page.goto(ROUTES.COMPONENTS);

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "שדות קלט" }),
  });
  const checkbox = section.getByRole("checkbox", { name: "זכור אותי במכשיר זה" });
  const switchControl = section.getByRole("switch", { name: "התראות Slack ודוא״ל" });

  await expect(checkbox).toBeChecked();
  await checkbox.click();
  await expect(checkbox).not.toBeChecked();

  await expect(switchControl).toHaveAttribute("aria-checked", "true");
  await switchControl.click();
  await expect(switchControl).toHaveAttribute("aria-checked", "false");

  await expect(section.getByText("התקדמות צ׳קליסט שטח")).toBeVisible();
  await expect(section.getByText("7 / 12")).toBeVisible();
});

test("cards lift on hover and stay still with reduced motion", async ({ page }) => {
  await page.goto(ROUTES.COMPONENTS);

  const section = page.locator("section").filter({
    has: page.getByRole("heading", { name: "כפתורים" }),
  });
  const card = section.locator("section").first();

  await card.hover();
  await expect
    .poll(() => card.evaluate(element => getComputedStyle(element).transform))
    .not.toBe("none");

  await page.emulateMedia({ reducedMotion: "reduce" });

  await expect(card).toHaveCSS("transform", "none");
  await expect(card).toHaveCSS("transition-property", "none");
});

test.describe("mobile option activation", () => {
  test.use(PHONE);

  test("dragging across an option preserves the selection and tapping changes it", async ({
    page,
    context,
  }) => {
    const form = createTaskFormPage(page);
    const picker = form.assigneePicker;
    const engineerName = formatFullName(TEST_USERS[USER_ROLES.ENGINEER]);

    await form.goto();
    await expect(picker).toHaveValue(TASK_FORM_COPY.POOL_OPTION);
    await picker.tap();
    await expect(picker).toHaveValue("");

    const option = page.getByRole("option", { name: engineerName, exact: true });
    await expect(option).toBeVisible();
    const box = await option.boundingBox();

    if (!box) {
      throw new Error("Engineer option is not laid out");
    }

    const client = await context.newCDPSession(page);
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;

    await client.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y + box.height * 2 }],
    });
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    await expect(picker).toHaveValue("");
    await option.tap();
    await expect(picker).toHaveValue(engineerName);
  });
});
