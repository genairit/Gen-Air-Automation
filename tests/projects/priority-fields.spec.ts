import { API_PATHS } from "../../src/constants/api.constant.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { URLS } from "../../src/constants/environment.constant.ts";
import { createProjectPage } from "../../src/pages/project.page.ts";
import { seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { PROJECT_PRIORITY } from "../../src/constants/project-priority.constant.ts";
import { createTestDatabaseClient } from "../../src/environment/test-database-client.ts";

const PRIORITY_CASES = [
  {
    name: "populated Priority values survive API serialization and render the sync date",
    priorityId: PROJECT_PRIORITY.ID,
    prioritySyncedAt: PROJECT_PRIORITY.SYNCED_AT,
    caption: PROJECT_PRIORITY.SYNCED_CAPTION,
  },
  {
    name: "a new project exposes nullable Priority fields and renders the unsynced caption",
    priorityId: null,
    prioritySyncedAt: null,
    caption: PROJECT_PRIORITY.NOT_SYNCED_CAPTION,
  },
] as const;

for (const scenario of PRIORITY_CASES) {
  test(scenario.name, async ({ page, api, request }) => {
    const project = await seedStandaloneProject(api, await seedCustomer(api));
    const database = createTestDatabaseClient();

    await database.connect();

    try {
      if (scenario.priorityId) {
        await database.query(
          "UPDATE public.projects SET priority_id = $1, priority_synced_at = $2 WHERE id = $3",
          [scenario.priorityId, scenario.prioritySyncedAt, project.id],
        );
      }

      const response = await request.get(`${URLS.BACKEND}${API_PATHS.PROJECT}/${project.id}`, {
        headers: { Authorization: `Bearer ${api.session.accessToken}` },
      });

      expect(response.ok()).toBe(true);

      const body = await response.json();

      expect(body).toMatchObject({
        priorityId: scenario.priorityId,
        prioritySyncedAt: scenario.prioritySyncedAt,
      });
      expect(body).not.toHaveProperty("erpReference");
      expect(body).not.toHaveProperty("erpSyncedAt");

      const projectPage = createProjectPage(page);

      await projectPage.goto(project.id);
      await expect(projectPage.heading(project.name)).toBeVisible();
      await expect(page.getByText(scenario.caption, { exact: true })).toBeVisible();
      await page.reload();
      await expect(page.getByText(scenario.caption, { exact: true })).toBeVisible();
    } finally {
      await database.end();
    }
  });
}
