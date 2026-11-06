import type { Page, Locator } from "@playwright/test";
import { escapeRegex } from "../utilities/regex.utility.ts";

const CARD_XPATH = "xpath=ancestor::section[1]";

const buildExactPattern = (text: string) => new RegExp(`^${escapeRegex(text)}$`);

export const findCardByTitle = (scope: Page | Locator, title: string): Locator =>
  scope.getByText(buildExactPattern(title)).locator(CARD_XPATH);

export const findFormSectionByTitle = findCardByTitle;
