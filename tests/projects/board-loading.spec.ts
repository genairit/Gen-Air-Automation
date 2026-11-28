import { API_PATHS } from "../../src/constants/api.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { BOARD_COPY } from "../../src/constants/copy.constant.ts";
import { HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createDeferred } from "../../src/utilities/deferred.utility.ts";
import { buildBrowserApiPath } from "../../src/utilities/api-path.utility.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";

const matchesProjectList = (url: URL) =>
  url.pathname === buildBrowserApiPath(API_PATHS.PROJECT) && url.searchParams.has("batchSize");

test("the project list shows initial loading and appends its next page on scroll", async ({
  page,
  api,
}) => {
  const board = createBoardPage(page);
  const customer = await seedCustomer(api);
  const pageSize = 25;
  for (const _ of Array.from({ length: pageSize + 1 })) {
    await seedStandaloneProject(api, customer);
  }

  const release = createDeferred();
  await page.route(
    matchesProjectList,
    async route => {
      await release.promise;
      await route.continue();
    },
    { times: 1 },
  );
  await board.goto();
  try {
    await expect(board.card.getByText(BOARD_COPY.LOADING)).toBeVisible();
  } finally {
    release.resolve();
  }
  const rows = board.card.getByRole("row").filter({ has: page.getByRole("cell") });
  await expect(rows).toHaveCount(pageSize);
  const initialCells = await rows.first().getByRole("cell").allTextContents();
  await rows.last().scrollIntoViewIfNeeded();
  await expect.poll(() => rows.count()).toBeGreaterThan(pageSize);
  await expect(rows.first().getByRole("cell")).toHaveText(initialCells);
  const projectIdentities = await rows.locator('[role="cell"]:first-child').allTextContents();
  expect(projectIdentities).toHaveLength(await rows.count());
  expect(new Set(projectIdentities).size).toBe(projectIdentities.length);
});

test("a failed project request shows the error and a different search recovers", async ({
  page,
  api,
}) => {
  const board = createBoardPage(page);
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const error = "Projects are temporarily unavailable";
  await page.route(matchesProjectList, route =>
    route.fulfill({
      status: HTTP_STATUS.SERVICE_UNAVAILABLE,
      json: { message: error },
    }),
  );
  await board.goto();
  await expect(board.card.getByRole("alert")).toContainText(error);
  await page.unroute(matchesProjectList);
  await board.searchBox.fill(project.name);
  await expect(board.findRow(project.name)).toBeVisible();
  await expect(board.card.getByRole("alert")).toHaveCount(0);
});
