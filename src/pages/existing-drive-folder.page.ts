import type { Page, Locator } from "@playwright/test";
import { findFieldByTitle } from "./field.component.ts";
import { EXISTING_DRIVE_COPY } from "../constants/existing-drive-folder.constant.ts";

export const existingDriveFolderField = (page: Page): Locator =>
  findFieldByTitle(page, EXISTING_DRIVE_COPY.INPUT);
export const existingDriveRadio = (page: Page): Locator =>
  page.getByRole("radio", { name: EXISTING_DRIVE_COPY.EXISTING, exact: true });
export const newDriveRadio = (page: Page): Locator =>
  page.getByRole("radio", { name: EXISTING_DRIVE_COPY.NEW, exact: true });
