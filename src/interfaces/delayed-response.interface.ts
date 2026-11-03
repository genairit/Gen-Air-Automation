import type { Page } from "@playwright/test";

export interface IDelayedResponseOptions {
  page: Page;
  path: string;
  status?: number;
}
