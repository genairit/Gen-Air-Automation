import type { Page, Locator } from "@playwright/test";
import { escapeRegex } from "../utilities/regex.utility.ts";

const FIELD_CONTAINER_XPATH = "xpath=ancestor::div[.//input or .//textarea][1]";

const LIST_SECTION_XPATH = "xpath=ancestor::div[.//li][1]";

const LINK_TILE_XPATH = "xpath=ancestor::div[.//a][1]";

// Field titles render a trailing "*" inside the same element when the field is required.
const buildTitlePattern = (title: string) => new RegExp(`^${escapeRegex(title)}\\s*\\*?$`);

export const findFieldContainer = (scope: Page | Locator, title: string): Locator =>
  scope.getByText(buildTitlePattern(title)).locator(FIELD_CONTAINER_XPATH);

export const findFieldByTitle = (scope: Page | Locator, title: string): Locator =>
  findFieldContainer(scope, title).getByRole("textbox");

export const findListUnderTitle = (scope: Page | Locator, title: string): Locator =>
  scope.getByText(title, { exact: true }).locator(LIST_SECTION_XPATH).getByRole("list");

export const findLinkTileByLabel = (scope: Page | Locator, label: string): Locator =>
  scope.getByText(label, { exact: true }).locator(LINK_TILE_XPATH);

export const findLinkUnderLabel = (scope: Page | Locator, label: string): Locator =>
  findLinkTileByLabel(scope, label).getByRole("link");
