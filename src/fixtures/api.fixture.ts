import { test as base } from "./test.fixture.ts";

export const test = base.extend({ storageState: { cookies: [], origins: [] } });
export { expect } from "@playwright/test";
