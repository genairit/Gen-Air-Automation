import {
  CONTACT_ROLES,
  PROJECT_TYPE_NAMES,
  PAYMENT_TERMS_LABELS,
} from "../../src/constants/domain.constant.ts";

import {
  RETIRED_ROLES,
  NON_MEMBER_ROLES,
  USER_ROLE_LABELS,
  USER_ROLE_VALUES,
  PROJECT_MEMBER_ROLES,
} from "../../src/constants/user-role.constant.ts";

import { ROUTES } from "../../src/constants/routes.constant.ts";
import { createBoardPage } from "../../src/pages/board.page.ts";
import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { escapeRegex } from "../../src/utilities/regex.utility.ts";
import { formatFullName } from "../../src/utilities/user.utility.ts";
import { FAKE_PLACES } from "../../src/constants/fake-places.constant.ts";
import { createProjectFormPage } from "../../src/pages/project-form.page.ts";
import { ROUTE_PATTERNS } from "../../src/constants/route-patterns.constant.ts";
import { PROJECT_DRAFT_VERSIONS } from "../../src/constants/storage.constant.ts";
import { buildProjectDraftKey } from "../../src/utilities/auth-state.utility.ts";
import { seedUser, seedCustomer, seedStandaloneProject } from "../../src/api/seed-data.ts";
import { createUniqueName, createMobilePhone } from "../../src/utilities/test-data.utility.ts";
import { buildEditProjectRoute, readLastPathSegment } from "../../src/utilities/route.utility.ts";

const PROJECT_NAME_PREFIXES = {
  NEW: "פרויקט חדש",
  PARTIAL: "פרויקט חלקי",
  RENAMED: "פרויקט ששונה",
  TEAM: "פרויקט עם צוות",
  DRAFT: "טיוטת פרויקט",
} as const;

const NEW_PROJECT_CONTACT_NAME = "יוסי לוי";

test("create a project with a verified address and see it on the board", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const formPage = createProjectFormPage(page);
  const boardPage = createBoardPage(page);
  const projectName = createUniqueName(PROJECT_NAME_PREFIXES.NEW);

  await boardPage.goto();
  await boardPage.newProjectButton.click();
  await formPage.fill({
    name: projectName,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    contactPhone: createMobilePhone(),
    contactName: NEW_PROJECT_CONTACT_NAME,
    contactRole: CONTACT_ROLES.ENGINEER,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });

  await expect(formPage.addressVerified).toBeVisible();

  await formPage.createButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  await expect(page.getByRole("heading", { name: projectName })).toBeVisible();

  await boardPage.goto();
  await boardPage.searchBox.fill(projectName);

  await expect(boardPage.findRow(projectName)).toBeVisible();
});

test("the create button stays disabled until the required fields are filled", async ({ page }) => {
  const formPage = createProjectFormPage(page);

  await formPage.goto();
  await formPage.nameInput.fill(createUniqueName(PROJECT_NAME_PREFIXES.PARTIAL));

  await expect(formPage.createButton).toBeDisabled();
});

test("edit a project name and see the change on its page", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createProjectFormPage(page);
  const renamedProject = createUniqueName(PROJECT_NAME_PREFIXES.RENAMED);

  await page.goto(buildEditProjectRoute(project.id));
  await formPage.nameInput.fill(renamedProject);
  await formPage.saveButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);
  await expect(page.getByRole("heading", { name: renamedProject })).toBeVisible();
});

test("delete a project removes it from the board", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const formPage = createProjectFormPage(page);
  const boardPage = createBoardPage(page);

  await page.goto(buildEditProjectRoute(project.id));
  await formPage.deleteButton.click();

  await expect(page).toHaveURL(ROUTES.BOARD);

  await boardPage.searchBox.fill(project.name);

  await expect(boardPage.findRow(project.name)).toHaveCount(0);
});

test("the form offers four optional member slots that each list only their role", async ({
  page,
  api,
}) => {
  const employees = await Promise.all(USER_ROLE_VALUES.map(role => seedUser(api, role)));
  const formPage = createProjectFormPage(page);

  await formPage.goto();

  await expect(formPage.memberSlotPickers).toHaveCount(PROJECT_MEMBER_ROLES.length);
  for (const role of NON_MEMBER_ROLES) {
    await expect(
      formPage.rolesSection.getByText(USER_ROLE_LABELS[role], { exact: true }),
    ).toHaveCount(0);
  }

  for (const role of PROJECT_MEMBER_ROLES) {
    await expect(formPage.memberSlotPicker(role)).toHaveValue("");

    const options = await formPage.openMemberSlot(role);

    for (const employee of employees) {
      const expectedCount = employee.role === role ? 1 : 0;

      await expect(options.filter({ hasText: formatFullName(employee) })).toHaveCount(
        expectedCount,
      );
    }

    await page.keyboard.press("Escape");
  }
});

test("create a project with every member slot filled and see the team on the edit form", async ({
  page,
  api,
}) => {
  const customer = await seedCustomer(api);
  const members = await Promise.all(
    PROJECT_MEMBER_ROLES.map(async role => ({ role, user: await seedUser(api, role) })),
  );
  const formPage = createProjectFormPage(page);
  const projectName = createUniqueName(PROJECT_NAME_PREFIXES.TEAM);

  await formPage.goto();
  await formPage.fill({
    name: projectName,
    place: FAKE_PLACES[1],
    customerName: customer.name,
    contactPhone: createMobilePhone(),
    contactName: NEW_PROJECT_CONTACT_NAME,
    contactRole: CONTACT_ROLES.ENGINEER,
    projectTypeName: PROJECT_TYPE_NAMES.COMMERCIAL,
    paymentTermsLabel: PAYMENT_TERMS_LABELS.MILESTONES_NET_60,
  });
  for (const member of members) {
    await formPage.chooseMember(member.role, formatFullName(member.user));
  }

  await formPage.createButton.click();

  await expect(page).toHaveURL(ROUTE_PATTERNS.PROJECT);

  const projectId = readLastPathSegment(page.url());
  const savedMembers = await api.getProjectMembers(projectId);

  expect(savedMembers).toHaveLength(members.length);
  expect(savedMembers).toEqual(
    expect.arrayContaining(
      members.map(member => expect.objectContaining({ role: member.role, userId: member.user.id })),
    ),
  );

  await formPage.gotoEdit(projectId);

  for (const member of members) {
    await expect(formPage.memberSlotPicker(member.role)).toHaveValue(
      new RegExp(escapeRegex(formatFullName(member.user))),
    );
  }
});

test("a current-version draft is restored on the new-project form", async ({ page, api }) => {
  const formPage = createProjectFormPage(page);
  const projectName = createUniqueName(PROJECT_NAME_PREFIXES.DRAFT);
  const draftKey = buildProjectDraftKey(api.session.user.id);

  await formPage.goto();
  await formPage.nameInput.fill(projectName);

  const storedDraft = await page.evaluate(key => localStorage.getItem(key), draftKey);

  expect(JSON.parse(storedDraft ?? "{}")).toMatchObject({
    version: PROJECT_DRAFT_VERSIONS.CURRENT,
    values: { name: projectName },
  });

  await page.reload();

  await expect(formPage.draftRestored).toBeVisible();
  await expect(formPage.nameInput).toHaveValue(projectName);
});

test("a draft saved before the member-slot change is discarded", async ({ page, api }) => {
  const formPage = createProjectFormPage(page);
  const draftKey = buildProjectDraftKey(api.session.user.id);
  const legacyDraft = JSON.stringify({
    version: PROJECT_DRAFT_VERSIONS.LEGACY,
    values: {
      typeId: null,
      stageId: null,
      terms: null,
      name: createUniqueName(PROJECT_NAME_PREFIXES.DRAFT),
      assignees: {
        secretary: null,
        system_admin: api.session.user.id,
        project_manager: null,
        [RETIRED_ROLES.LEAD_INSTALLER]: null,
      },
    },
  });

  await formPage.goto();
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [draftKey, legacyDraft]);
  await page.reload();

  await expect(formPage.createButton).toBeVisible();
  await expect(formPage.nameInput).toHaveValue("");
  await expect(formPage.draftRestored).toHaveCount(0);
});
