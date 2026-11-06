import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { APP_DIRECTORIES } from "../../src/constants/environment.constant.ts";

test("frontend Caddy config denies framing of every served route", async () => {
  const caddyfile = await readFile(join(APP_DIRECTORIES.FRONTEND, "Caddyfile"), "utf8");

  expect(caddyfile).toMatch(/Content-Security-Policy\s+"frame-ancestors 'none'"/);
  expect(caddyfile).toMatch(/X-Frame-Options\s+"DENY"/);
});
