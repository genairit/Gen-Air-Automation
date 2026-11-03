import { test } from "node:test";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { API_PATHS } from "../../src/constants/api.constant.ts";
import { selectOption } from "../../src/pages/select.component.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { delayApiResponse } from "../../src/mocks/delayed-response.mock.ts";
import { buildBrowserApiPath } from "../../src/utilities/api-path.utility.ts";

const SYNTHETIC_RESPONSE_EVENT = "qa-synthetic-response";

const withBrowserPage = async run => {
  const server = createServer((request, response) => {
    const isApi = request.url?.startsWith(buildBrowserApiPath(API_PATHS.MY_USER));
    response.setHeader("Content-Type", isApi ? "application/json" : "text/html");
    response.end(isApi ? JSON.stringify({ role: "stale-admin" }) : "<!doctype html><main></main>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await run(page);
  } finally {
    await browser.close();
    await new Promise((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    );
  }
};

test("lazy selection scopes both lookup and scroll to aria-controls with duplicate option labels", () =>
  withBrowserPage(async page => {
    await page.setContent(`
      <button role="combobox" aria-controls="owned">Assignee</button>
      <div role="listbox"><div role="option">Target</div></div>
      <div role="listbox" id="owned" style="height:40px;overflow:auto">
        <div style="height:200px"><div role="option">First</div></div>
      </div>
      <output></output>
    `);
    await page.evaluate(() => {
      const owned = document.getElementById("owned");
      owned.addEventListener(
        "scroll",
        () => {
          owned.innerHTML = '<div role="option">Target</div>';
        },
        { once: true },
      );
      owned.addEventListener("click", event => {
        document.querySelector("output").textContent = event.target.textContent;
      });
    });
    await selectOption(page, page.getByRole("combobox"), "Target");
    assert.equal(await page.locator("output").textContent(), "Target");
  }));

test("lazy selection explicitly rejects a combobox without aria-controls", () =>
  withBrowserPage(async page => {
    await page.setContent('<button role="combobox">Assignee</button>');
    await assert.rejects(
      selectOption(page, page.getByRole("combobox"), "Target"),
      /must identify its controlled listbox/,
    );
  }));

test("lazy selection rejects a missing owned listbox instead of using an unrelated one", () =>
  withBrowserPage(async page => {
    await page.setContent(`
      <button role="combobox" aria-controls="missing">Assignee</button>
      <div role="listbox"><div role="option">Target</div></div>
    `);
    await assert.rejects(selectOption(page, page.getByRole("combobox"), "Target"), /toBeVisible/);
  }));

test("lazy selection fails for a missing owned option despite an identically named unrelated option", () =>
  withBrowserPage(async page => {
    await page.setContent(`
      <button role="combobox" aria-controls="owned">Assignee</button>
      <div role="listbox"><div role="option">Target</div></div>
      <div role="listbox" id="owned"><div role="option">Other</div></div>
    `);
    await assert.rejects(selectOption(page, page.getByRole("combobox"), "Target"), /toBe/);
  }));

const sendSyntheticRequest = page =>
  page.evaluate(
    ({ path, method, eventName }) => {
      document.querySelector("main").textContent = "current-finance";
      const request = new XMLHttpRequest();
      request.open(method, path);
      request.onloadend = async () => {
        const response = JSON.parse(request.responseText);
        await Promise.resolve();
        await Promise.resolve();
        requestAnimationFrame(() => {
          window.dispatchEvent(new CustomEvent(eventName, { detail: response }));
        });
      };
      request.send();
    },
    {
      path: buildBrowserApiPath(API_PATHS.MY_USER),
      method: HTTP_METHODS.GET,
      eventName: SYNTHETIC_RESPONSE_EVENT,
    },
  );

const startPreserveCurrentRequest = async page => {
  await page.evaluate(eventName => {
    window.addEventListener(
      eventName,
      () => {
        document.querySelector("main").textContent = "current-finance";
      },
      { once: true },
    );
  }, SYNTHETIC_RESPONSE_EVENT);
  await sendSyntheticRequest(page);
};

const startApplyStaleRequest = async page => {
  await page.evaluate(eventName => {
    window.addEventListener(
      eventName,
      event => {
        document.querySelector("main").textContent = event.detail.role;
      },
      { once: true },
    );
  }, SYNTHETIC_RESPONSE_EVENT);
  await sendSyntheticRequest(page);
};

test("response barrier acknowledges browser consumption and commits before asserting protected state", () =>
  withBrowserPage(async page => {
    const delayed = await delayApiResponse({ page, path: API_PATHS.MY_USER });
    try {
      await startPreserveCurrentRequest(page);
      await delayed.received;
      assert.equal(await page.locator("main").textContent(), "current-finance");
      await delayed.releaseAndWaitForApplication();
      assert.equal(await page.locator("main").textContent(), "current-finance");
    } finally {
      delayed.release();
    }
  }));

test("negative control: stale response application fails the unchanged-state assertion after the barrier", () =>
  withBrowserPage(async page => {
    const delayed = await delayApiResponse({ page, path: API_PATHS.MY_USER });
    try {
      await startApplyStaleRequest(page);
      await delayed.received;
      assert.equal(await page.locator("main").textContent(), "current-finance");
      await delayed.releaseAndWaitForApplication();
      const actual = await page.locator("main").textContent();
      assert.throws(() => assert.equal(actual, "current-finance"), { code: "ERR_ASSERTION" });
      assert.equal(actual, "stale-admin");
    } finally {
      delayed.release();
    }
  }));
