import {
  PROJECT_CONTACT_ROLE_LABELS,
  type ProjectContactRoleType,
} from "../constants/project-contact-role.constant.ts";

import type { Page, Locator } from "@playwright/test";
import { findFieldByTitle } from "./field.component.ts";
import { KEYBOARD_KEYS } from "../constants/keyboard.constant.ts";

export const contactRolePicker = (page: Page, role: ProjectContactRoleType): Locator =>
  page
    .getByRole("combobox", { name: PROJECT_CONTACT_ROLE_LABELS[role], exact: true })
    .and(page.locator("input[readonly]"));

export const contactRoleEditor = (page: Page, role: ProjectContactRoleType): Locator =>
  page
    .getByRole("button", { name: `הוסף ${PROJECT_CONTACT_ROLE_LABELS[role]}`, exact: true })
    .locator("xpath=ancestor::div[.//input[@role='combobox']][1]");

export const selectRoleContact = async (
  page: Page,
  role: ProjectContactRoleType,
  name: string,
): Promise<void> => {
  await contactRolePicker(page, role).click();
  const search = page
    .getByRole("combobox", { name: PROJECT_CONTACT_ROLE_LABELS[role], exact: true })
    .and(page.locator("input:not([readonly])"));
  await search.fill(name);
  await page.getByRole("option").filter({ hasText: name }).waitFor({ state: "visible" });
  await search.press(KEYBOARD_KEYS.ENTER);
};

export const fillRoleContactEditor = async (
  page: Page,
  role: ProjectContactRoleType,
  name: string,
): Promise<Locator> => {
  const editor = contactRoleEditor(page, role);
  await findFieldByTitle(editor, "שם").fill(name);
  await findFieldByTitle(editor, "טלפון").fill("+12025550123");
  return editor.getByRole("button", { name: "שמירה", exact: true });
};
