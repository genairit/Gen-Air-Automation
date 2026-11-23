import {
  seedBuilding,
  seedCustomer,
  seedStandaloneProject,
  buildStandaloneProjectInput,
} from "../../src/api/seed-data.ts";

import {
  readRoleLinks,
  seedRoleContact,
  contactRolePath,
} from "../../src/api/project-contact-roles.api.ts";

import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { SEED_VALUES } from "../../src/constants/seed.constant.ts";
import { HTTP_METHODS } from "../../src/constants/http.constant.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { createApartmentNumber } from "../../src/utilities/apartment-fixture.utility.ts";
import { PROJECT_CONTACT_ROLES } from "../../src/constants/project-contact-role.constant.ts";

const ROLES = Object.values(PROJECT_CONTACT_ROLES);

test("project and apartment creation persist optional named roles atomically without reclassifying legacy contacts", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const contacts = await Promise.all(ROLES.map(() => seedRoleContact(api)));
  const legacy = await seedRoleContact(api);
  const links = contacts.map((contact, index) => ({
    contactId: contact.id,
    role: ROLES[index],
    isPrimary: index === 0,
  }));
  const project = await api.createProject({
    ...(await buildStandaloneProjectInput(api, customer)),
    contacts: [...links, { contactId: legacy.id, role: "אדריכל", isPrimary: false }],
  });
  expect(await readRoleLinks(api, project.id)).toEqual(
    expect.arrayContaining(links.map(link => expect.objectContaining(link))),
  );
  expect(await readRoleLinks(api, project.id)).toContainEqual(
    expect.objectContaining({ contactId: legacy.id, role: "אדריכל" }),
  );
  const building = await seedBuilding(api, customer);
  const apartment = await api.createApartment(building.id, {
    customerId: customer.id,
    customerApartment: createApartmentNumber(),
    customerFloor: SEED_VALUES.APARTMENT_FLOOR,
    contacts: links,
  });
  expect(await readRoleLinks(api, apartment.id)).toHaveLength(ROLES.length);
  expect(await readRoleLinks(api, apartment.id)).toEqual(
    expect.arrayContaining(links.map(link => expect.objectContaining(link))),
  );
  const empty = await seedStandaloneProject(api, customer);
  expect(await readRoleLinks(api, empty.id)).toEqual([]);
  const rejectedInput = await buildStandaloneProjectInput(api, customer);
  const invalid = await api.send(HTTP_METHODS.POST, "/project", {
    ...rejectedInput,
    contacts: [links[0], { ...links[1], role: ROLES[0] }],
  });
  expect(invalid.status()).toBe(400);
  const search = await api.send(
    HTTP_METHODS.GET,
    `/project?search=${encodeURIComponent(rejectedInput.name)}`,
  );
  expect(search.ok()).toBe(true);
  expect(await search.json()).toMatchObject({ items: [] });
});

test("repeated same-contact assignment and shared detail editing preserve persisted role, replacement and clear preserve directory and primary identity", async ({
  api,
}) => {
  const owner = await seedCustomer(api);
  const project = await seedStandaloneProject(api, owner);
  const other = await seedStandaloneProject(api, owner);
  const first = await seedRoleContact(api);
  const second = await seedRoleContact(api);
  const rolePath = contactRolePath(project.id, PROJECT_CONTACT_ROLES.ARCHITECT);
  expect(
    (
      await api.send(HTTP_METHODS.POST, `/project/${project.id}/contacts`, {
        contactId: first.id,
        role: null,
        isPrimary: true,
      })
    ).ok(),
  ).toBe(true);
  for (const projectId of [project.id, other.id]) {
    expect(
      (
        await api.send(
          HTTP_METHODS.PUT,
          contactRolePath(projectId, PROJECT_CONTACT_ROLES.ARCHITECT),
          { contactId: first.id },
        )
      ).ok(),
    ).toBe(true);
  }
  expect((await api.send(HTTP_METHODS.PUT, rolePath, { contactId: first.id })).ok()).toBe(true);
  expect(await readRoleLinks(api, project.id)).toContainEqual(
    expect.objectContaining({
      contactId: first.id,
      role: PROJECT_CONTACT_ROLES.ARCHITECT,
      isPrimary: true,
    }),
  );
  const name = first.name + " מתוקן";
  expect(
    (await api.send(HTTP_METHODS.PATCH, `/contact-directory/${first.id}`, { name })).ok(),
  ).toBe(true);
  expect((await api.send(HTTP_METHODS.PUT, rolePath, { contactId: first.id })).ok()).toBe(true);
  for (const projectId of [project.id, other.id]) {
    expect(await readRoleLinks(api, projectId)).toContainEqual(
      expect.objectContaining({
        contactId: first.id,
        role: PROJECT_CONTACT_ROLES.ARCHITECT,
        contact: expect.objectContaining({ name }),
      }),
    );
  }
  expect((await api.send(HTTP_METHODS.PUT, rolePath, { contactId: second.id })).ok()).toBe(true);
  expect(await readRoleLinks(api, project.id)).toContainEqual(
    expect.objectContaining({ contactId: second.id, role: PROJECT_CONTACT_ROLES.ARCHITECT }),
  );
  expect(await readRoleLinks(api, project.id)).toContainEqual(
    expect.objectContaining({ contactId: first.id, role: null, isPrimary: true }),
  );
  expect((await api.send(HTTP_METHODS.PUT, rolePath, { contactId: null })).ok()).toBe(true);
  expect(
    (await readRoleLinks(api, project.id)).some(
      link => link.role === PROJECT_CONTACT_ROLES.ARCHITECT,
    ),
  ).toBe(false);
  const directory = await api.send(
    HTTP_METHODS.GET,
    `/contact-directory?search=${encodeURIComponent(name)}`,
  );
  expect(directory.ok()).toBe(true);
  expect(await directory.json()).toContainEqual(expect.objectContaining({ id: first.id }));
  expect(await readRoleLinks(api, other.id)).toContainEqual(
    expect.objectContaining({ contactId: first.id, role: PROJECT_CONTACT_ROLES.ARCHITECT }),
  );
});

test("slot conflicts, invalid contacts, missing fields and forbidden mutations do not replace saved assignments", async ({
  api,
  apiAs,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const contact = await seedRoleContact(api);
  const architect = contactRolePath(project.id, PROJECT_CONTACT_ROLES.ARCHITECT);
  expect((await api.send(HTTP_METHODS.PUT, architect, { contactId: contact.id })).ok()).toBe(true);
  expect(
    (
      await api.send(
        HTTP_METHODS.PUT,
        contactRolePath(project.id, PROJECT_CONTACT_ROLES.CONSULTANT),
        { contactId: contact.id },
      )
    ).status(),
  ).toBe(409);
  expect((await api.send(HTTP_METHODS.PUT, architect, {})).status()).toBe(400);
  expect(
    (
      await api.send(HTTP_METHODS.PUT, architect, {
        contactId: "00000000-0000-4000-8000-000000000000",
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await api.send(HTTP_METHODS.PUT, `/project/${project.id}/contacts/roles/unrecognized`, {
        contactId: null,
      })
    ).status(),
  ).toBe(400);
  const installer = await apiAs(TEST_USERS[USER_ROLES.INSTALLER]);
  expect((await installer.send(HTTP_METHODS.PUT, architect, { contactId: null })).status()).toBe(
    403,
  );
  expect(await readRoleLinks(api, project.id)).toContainEqual(
    expect.objectContaining({ contactId: contact.id, role: PROJECT_CONTACT_ROLES.ARCHITECT }),
  );
});
