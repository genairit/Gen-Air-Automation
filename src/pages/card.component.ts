import type { Page, Locator } from "@playwright/test";
import { escapeRegex } from "../utilities/regex.utility.ts";

// A card is the nearest ancestor of its bold title that also holds the card's fields or tiles.
const CARD_XPATH = "xpath=ancestor::div[.//input or .//bdi][1]";

const buildExactPattern = (text: string) => new RegExp(`^${escapeRegex(text)}$`);

export const findCardByTitle = (scope: Page | Locator, title: string): Locator =>
  scope.locator("b", { hasText: buildExactPattern(title) }).locator(CARD_XPATH);
