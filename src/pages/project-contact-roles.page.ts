import {
  PROJECT_CONTACT_ROLE_COPY,
  PROJECT_CONTACT_ROLE_LABELS,
  type ProjectContactRoleType,
} from "../constants/project-contact-role.constant.ts";

import { findCardByTitle } from "./card.component.ts";
import type { Page, Locator } from "@playwright/test";
import { findFieldByTitle } from "./field.component.ts";
import { KEYBOARD_KEYS } from "../constants/keyboard.constant.ts";

export const contactRolePicker = (page: Page, role: ProjectContactRoleType): Locator =>
  findCardByTitle(page, PROJECT_CONTACT_ROLE_COPY.CREATE_SECTION)
    .or(findCardByTitle(page, PROJECT_CONTACT_ROLE_COPY.SECTION))
    .or(page.getByRole("dialog", { name: PROJECT_CONTACT_ROLE_LABELS[role], exact: true }))
    .getByRole("combobox", { name: PROJECT_CONTACT_ROLE_LABELS[role], exact: true })
    .and(page.locator("input[readonly]"));

export const openContactRoleControls = async (page: Page, role: ProjectContactRoleType) => {
  const mobileContacts = page
    .getByRole("group", { name: "צוות ואנשי קשר", exact: true })
    .getByRole("button", { name: "אנשי קשר", exact: true });
  if (await mobileContacts.isVisible()) await mobileContacts.click();
  const label = PROJECT_CONTACT_ROLE_LABELS[role];
  const disclosure = page.getByRole("button", { name: new RegExp(`^(שייך|ערוך) ${label}$`) });
  if (await disclosure.isVisible()) await disclosure.click();
};

export const contactRoleEditor = (page: Page, role: ProjectContactRoleType): Locator =>
  page
    .getByRole("button", { name: `הוסף ${PROJECT_CONTACT_ROLE_LABELS[role]}`, exact: true })
    .locator("xpath=ancestor::div[.//input[@role='combobox']][1]");

export const selectRoleContact = async (
  page: Page,
  role: ProjectContactRoleType,
  name: string,
): Promise<void> => {
  await openContactRoleControls(page, role);
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
