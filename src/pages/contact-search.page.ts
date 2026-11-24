import type { Page, Locator } from "@playwright/test";
import { findCardByTitle } from "./card.component.ts";
import { CONTACT_SEARCH } from "../constants/contact-search.constant.ts";
import { PROJECT_CONTACT_ROLE_COPY } from "../constants/project-contact-role.constant.ts";
import type { ProjectContactRoleType } from "../constants/project-contact-role.constant.ts";
import { PROJECT_CONTACT_ROLE_LABELS } from "../constants/project-contact-role.constant.ts";

export const additionalContactSection = (page: Page): Locator =>
  findCardByTitle(page, PROJECT_CONTACT_ROLE_COPY.CREATE_SECTION);

export const projectContactsSection = (page: Page): Locator =>
  findCardByTitle(page, PROJECT_CONTACT_ROLE_COPY.SECTION);

export const contactSearchInput = (scope: Page | Locator): Locator =>
  scope.getByRole("searchbox", { name: CONTACT_SEARCH.INPUT, exact: true });

export const activeRoleSearch = (page: Page, role: ProjectContactRoleType): Locator =>
  page
    .getByRole("combobox", { name: PROJECT_CONTACT_ROLE_LABELS[role], exact: true })
    .and(page.locator("input:not([readonly])"));
