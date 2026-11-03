import type { Page } from "@playwright/test";
import { BROWSER_EVENTS } from "../constants/browser-event.constant.ts";

export const refreshVisibility = (page: Page) =>
  page.evaluate(event => window.dispatchEvent(new Event(event)), BROWSER_EVENTS.VISIBILITY_CHANGE);
