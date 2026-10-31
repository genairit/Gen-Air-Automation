import {
  seedCustomer,
  buildCustomerInput,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  catalogueIds,
  saveQuotation,
  quotationPage,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "../../src/api/quotation.api.ts";

import {
  createCatalogueFixture,
  withQuotationRuleVersionChange,
} from "../../src/environment/quotation-fixtures.ts";

import { randomUUID } from "node:crypto";
import { isRecord } from "../../src/utilities/guard.utility.ts";
import { test, expect } from "../../src/fixtures/api.fixture.ts";
import { USER_ROLES } from "../../src/constants/user-role.constant.ts";
import { TEST_USERS } from "../../src/constants/test-users.constant.ts";
import { withRolePermissions } from "../../src/environment/role-permissions.ts";
import { QUOTATION, QUOTATION_DUPLICATE_SKUS } from "../../src/constants/quotation.constant.ts";

const draftLine = (catalogueItemId: string, price = "10.0050") => ({
  id: randomUUID(),
  catalogueItemId,
  parentItemId: null,
  description: "Independent quote description",
  quotedPrice: price,
  quantity: "1",
  location: "",
  circuit: null,
  requestedCapacityBtu: null,
});
const section = (catalogueItemId: string) => ({
  id: randomUUID(),
  title: "Room",
  systemType: QUOTATION.SYSTEM.SINGLE,
  items: [draftLine(catalogueItemId)],
});

test("customer defaults are copied, notes empty, independent quotations retain identity and terms", async ({
  api,
}) => {
  const customer = await api.createCustomer({ ...buildCustomerInput(), paymentTerms: "prepaid" });
  const first = await createQuotation(api, customer.id);
  const second = await createQuotation(api, customer.id);
  expect(first.paymentTerms).toBe("prepaid");
  expect(first.paymentTermsNote).toBe("");
  expect(first.projectId).toBeNull();
  expect(first.status).toBe(QUOTATION.STATUS.DRAFT);
  expect(second.id).not.toBe(first.id);
  expect(second.number).not.toBe(first.number);
  const updated = await saveQuotation(api, first.id, {
    ...quotationWrite(first),
    paymentTermsNote: "Quotation only",
  });
  expect(updated.id).toBe(first.id);
  expect(updated.paymentTermsNote).toBe("Quotation only");
  expect(
    (await quotationDocument(await api.send("GET", `/quotation/${second.id}`))).paymentTermsNote,
  ).toBe("");
});

test("catalogue-backed repeated lines use server decimal half-up totals and zero target", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const quote = await createQuotation(api, customer.id);
  const one = section(item.id);
  one.items.push(draftLine(item.id));
  const saved = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    brand: QUOTATION.BRAND,
    sections: [one],
  });
  expect(saved.sections[0]?.items).toHaveLength(2);
  expect(saved.totals.subtotal).toBe("20.02");
  const zero = await saveQuotation(api, quote.id, {
    ...quotationWrite(saved),
    discountPercent: "10",
    targetPretaxAmount: "0",
  });
  expect(zero.totals.pretax).toBe("0.00");
  expect(zero.totals.total).toBe("0.00");
  const malformed = await api.send("PUT", `/quotation/${quote.id}`, {
    ...quotationWrite(zero),
    sections: [{ ...one, items: [{ ...one.items[0], catalogueItemId: randomUUID() }] }],
  });
  expect(malformed.status()).toBe(400);
});

test("archived catalogue stays readable but cannot become a new line; snapshots survive edits", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const quote = await createQuotation(api, customer.id);
  const saved = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    brand: QUOTATION.BRAND,
    sections: [section(item.id)],
  });
  expect(
    (
      await api.send("PATCH", `/catalogue-item/${item.id}`, {
        status: QUOTATION.CATALOGUE.ARCHIVED,
        description: "Changed catalogue",
        price: "99",
      })
    ).ok(),
  ).toBeTruthy();
  expect((await api.send("GET", `/catalogue-item/${item.id}`)).ok()).toBeTruthy();
  const retained = await saveQuotation(api, quote.id, quotationWrite(saved));
  expect(retained.sections[0]?.items[0]?.description).toBe("Independent quote description");
  expect(retained.sections[0]?.items[0]?.quotedPrice).toBe("10.0050");
  const other = await createQuotation(api, customer.id);
  expect(
    (
      await api.send("PUT", `/quotation/${other.id}`, {
        ...quotationWrite(other),
        brand: QUOTATION.BRAND,
        sections: [section(item.id)],
      })
    ).status(),
  ).toBe(400);
});

test("optimistic versions permit only one concurrent writer", async ({ api }) => {
  const customer = await seedCustomer(api);
  const quote = await createQuotation(api, customer.id);
  const input = quotationWrite(quote);
  const results = await Promise.all(
    ["first", "second"].map(internalNotes =>
      api.send("PUT", `/quotation/${quote.id}`, { ...input, internalNotes }),
    ),
  );
  expect(results.map(result => result.status()).sort()).toEqual([200, 409]);
  const current = await quotationDocument(await api.send("GET", `/quotation/${quote.id}`));
  expect(current.version).toBe(quote.version + 1);
  expect(["first", "second"]).toContain(current.internalNotes);
});

test("required warnings block approval, self approval works and reopening preserves quotation id", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture({ price: "0" });
  const quote = await createQuotation(api, customer.id);
  const currentState = {
    value: await saveQuotation(api, quote.id, {
      ...quotationWrite(quote),
      brand: QUOTATION.BRAND,
      sections: [{ ...section(item.id), items: [draftLine(item.id, "0")] }],
    }),
  };
  currentState.value = await quotationDocument(
    await api.send("POST", `/quotation/${quote.id}/review`, {
      version: currentState.value.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  expect(currentState.value.warnings.length).toBeGreaterThan(0);
  expect(
    (
      await api.send("POST", `/quotation/${quote.id}/review`, {
        version: currentState.value.version,
        status: QUOTATION.STATUS.APPROVED,
      })
    ).status(),
  ).toBe(409);
  currentState.value = await quotationDocument(
    await api.send("POST", `/quotation/${quote.id}/warnings`, {
      version: currentState.value.version,
      warningKeys: currentState.value.warnings.map(warning => warning.key),
    }),
  );
  currentState.value = await quotationDocument(
    await api.send("POST", `/quotation/${quote.id}/review`, {
      version: currentState.value.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
  expect(currentState.value.status).toBe(QUOTATION.STATUS.APPROVED);
  expect(currentState.value.approvedById).toBe(api.session.user.id);
  const fingerprint = currentState.value.ruleConfigFingerprint;
  await withQuotationRuleVersionChange("zero_price", async () => {
    const frozen = await quotationDocument(await api.send("GET", `/quotation/${quote.id}`));
    expect(frozen.ruleConfigFingerprint).toBe(fingerprint);
  });
  currentState.value = await quotationDocument(
    await api.send("POST", `/quotation/${quote.id}/review`, {
      version: currentState.value.version,
      status: QUOTATION.STATUS.DRAFT,
    }),
  );
  expect(currentState.value.id).toBe(quote.id);
  expect(currentState.value.status).toBe(QUOTATION.STATUS.DRAFT);
});

test("rule changes invalidate unapproved acknowledgement keys", async ({ api }) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const quote = await createQuotation(api, customer.id);
  const saved = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    brand: QUOTATION.BRAND,
    sections: [section(item.id)],
  });
  const keys = saved.warnings.map(warning => warning.key);
  expect(keys.length).toBeGreaterThan(0);
  const acknowledged = await quotationDocument(
    await api.send("POST", `/quotation/${quote.id}/warnings`, {
      version: saved.version,
      warningKeys: keys,
    }),
  );
  expect(acknowledged.warnings.every(warning => warning.acknowledged)).toBe(true);
  await withQuotationRuleVersionChange("payment_terms", async () => {
    const refreshed = await quotationDocument(await api.send("GET", `/quotation/${quote.id}`));
    expect(refreshed.ruleConfigFingerprint).not.toBe(saved.ruleConfigFingerprint);
    expect(refreshed.warnings.map(warning => warning.key)).not.toEqual(keys);
    expect(refreshed.warnings.every(warning => !warning.acknowledged)).toBe(true);
    const page = await quotationPage(
      await api.send("GET", `/quotation?search=${encodeURIComponent(saved.number)}`),
    );
    expect(page.items.find(item => item.id === saved.id)?.ruleConfigFingerprint).toBe(
      refreshed.ruleConfigFingerprint,
    );
    expect(
      (
        await api.send("POST", `/quotation/${quote.id}/warnings`, {
          version: refreshed.version,
          warningKeys: keys,
        })
      ).status(),
    ).toBe(400);
  });
});

test("engineering role reads quotation configuration but cannot create or maintain catalogue", async ({
  api,
  apiAs,
}) => {
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  expect((await engineer.send("GET", QUOTATION.RULE_PATH)).ok()).toBeTruthy();
  expect((await engineer.send("POST", QUOTATION.PATH, { customerId: customer.id })).status()).toBe(
    403,
  );
  expect(
    (
      await engineer.send("PATCH", `/catalogue-item/${item.id}`, {
        status: QUOTATION.CATALOGUE.ARCHIVED,
      })
    ).status(),
  ).toBe(403);
});

test("duplicate SKUs are quarantined and concurrent explicit activation has one winner", async ({
  api,
}) => {
  const sku = `QA-duplicate-${randomUUID()}`;
  const first = await createCatalogueFixture({ sku, status: QUOTATION.CATALOGUE.CONFLICT });
  const second = await createCatalogueFixture({ sku, status: QUOTATION.CATALOGUE.CONFLICT });
  const hidden = await api.send("GET", `/catalogue-item?search=${encodeURIComponent(sku)}`);
  expect(await hidden.json()).toEqual([]);
  const responses = await Promise.all(
    [first, second].map(item =>
      api.send("PATCH", `/catalogue-item/${item.id}`, { status: QUOTATION.CATALOGUE.ACTIVE }),
    ),
  );
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  const visible: unknown = await (
    await api.send("GET", `/catalogue-item?search=${encodeURIComponent(sku)}`)
  ).json();
  expect(visible).toHaveLength(1);
});

test("matching filters compatibility and capacity before personal history; unchanged saves do not count", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const prefix = `QA-${randomUUID()}`;
  const close = await createCatalogueFixture({ sku: `${prefix}-close`, capacityBtu: 24000 });
  const far = await createCatalogueFixture({ sku: `${prefix}-far`, capacityBtu: 48000 });
  const wrong = await createCatalogueFixture({
    sku: `${prefix}-wrong`,
    brand: QUOTATION.OTHER_BRAND,
  });
  const quote = await createQuotation(api, customer.id);
  const savedState = {
    value: await saveQuotation(api, quote.id, {
      ...quotationWrite(quote),
      brand: QUOTATION.BRAND,
      sections: [section(far.id)],
    }),
  };
  savedState.value = await saveQuotation(api, quote.id, quotationWrite(savedState.value));
  const search = async (actor: typeof api, suffix = "") => {
    const response = await actor.send(
      "GET",
      `/catalogue-item?brand=${encodeURIComponent(QUOTATION.BRAND)}&systemType=SINGLE&search=${prefix}${suffix}`,
    );
    expect(response.ok()).toBeTruthy();
    return catalogueIds(response);
  };
  expect((await search(api))[0]).toBe(far.id);
  expect((await search(api, "&capacityBtu=24000"))[0]).toBe(close.id);
  expect((await search(api)).includes(wrong.id)).toBe(false);
  const other = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  expect((await search(other))[0]).toBe(close.id);
  const changed = quotationWrite(savedState.value);
  changed.sections[0]!.items[0]!.catalogueItemId = close.id;
  await saveQuotation(api, quote.id, changed);
  // One genuine selection each: the lexical close SKU wins their tie; autosave must not favor far.
  expect((await search(api))[0]).toBe(close.id);
});

test("no-sell retained line emits a required warning and is unavailable for new lines", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const quote = await createQuotation(api, customer.id);
  const saved = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    brand: QUOTATION.BRAND,
    sections: [section(item.id)],
  });
  expect(
    (
      await api.send("PATCH", `/catalogue-item/${item.id}`, { status: QUOTATION.CATALOGUE.NO_SELL })
    ).ok(),
  ).toBeTruthy();
  const current = await quotationDocument(await api.send("GET", `/quotation/${quote.id}`));
  expect(current.warnings.length).toBeGreaterThan(saved.warnings.length);
  const next = await createQuotation(api, customer.id);
  expect(
    (
      await api.send("PUT", `/quotation/${next.id}`, {
        ...quotationWrite(next),
        brand: QUOTATION.BRAND,
        sections: [section(item.id)],
      })
    ).status(),
  ).toBe(400);
});

test("catalogue mismatch, duplicate identifiers, forged fields and malformed decimals reject atomically", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const quote = await createQuotation(api, customer.id);
  const input = { ...quotationWrite(quote), brand: QUOTATION.BRAND, sections: [section(item.id)] };
  const line = input.sections[0]!.items[0]!;
  for (const invalid of [
    { ...input, totals: { total: "1" } },
    { ...input, status: QUOTATION.STATUS.APPROVED },
    { ...input, sections: [{ ...input.sections[0], items: [line, line] }] },
    { ...input, sections: [{ ...input.sections[0], items: [{ ...line, quotedPrice: "1e2" }] }] },
    { ...input, brand: QUOTATION.OTHER_BRAND },
  ])
    expect((await api.send("PUT", `/quotation/${quote.id}`, invalid)).status()).toBe(400);
  expect((await quotationDocument(await api.send("GET", `/quotation/${quote.id}`))).version).toBe(
    quote.version,
  );
});

test("VRF engineering checks remain required for headers, controls, missing sides, ratio and capacity", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const indoor = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.INDOOR,
    capacityBtu: 24000,
  });
  const outdoor = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.OUTDOOR,
    capacityBtu: 6000,
  });
  const quote = await createQuotation(api, customer.id);
  const indoorLine = { ...draftLine(indoor.id), circuit: "A", requestedCapacityBtu: 30000 };
  const outdoorLine = { ...draftLine(outdoor.id), circuit: "A" };
  const currentState = {
    value: await saveQuotation(api, quote.id, {
      ...quotationWrite(quote),
      brand: QUOTATION.BRAND,
      paymentTerms: "other",
      paymentTermsNote: "",
      paymentSchedule: [{ percent: "90", text: "First" }],
      sections: [
        {
          id: randomUUID(),
          title: QUOTATION.SYSTEM.VRF,
          systemType: QUOTATION.SYSTEM.VRF,
          items: [indoorLine, outdoorLine],
        },
      ],
    }),
  };
  const textsState = { value: currentState.value.warnings.map(warning => warning.text).join("\n") };
  for (const text of ["חנוכיות", "טרמוסטט", "דיוורסיטי", "12%", "פירוט", "90%"])
    expect(textsState.value).toContain(text);
  const inputState = { value: quotationWrite(currentState.value) };
  inputState.value.sections[0]!.items = [indoorLine];
  currentState.value = await saveQuotation(api, quote.id, inputState.value);
  expect(
    currentState.value.warnings.some(warning => warning.text.includes("בלי מעבה")),
  ).toBeTruthy();
  inputState.value = quotationWrite(currentState.value);
  inputState.value.sections[0]!.items = [outdoorLine];
  currentState.value = await saveQuotation(api, quote.id, inputState.value);
  expect(
    currentState.value.warnings.some(warning => warning.text.includes("בלי יחידות פנימיות")),
  ).toBeTruthy();
  const header = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.HEADER,
    capacityBtu: null,
  });
  const control = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.VRF,
    equipmentRole: QUOTATION.ROLE.CONTROL,
    capacityBtu: null,
  });
  inputState.value = quotationWrite(currentState.value);
  inputState.value.paymentTerms = "prepaid";
  inputState.value.paymentSchedule = [{ percent: "100", text: "All" }];
  inputState.value.sections[0]!.items = [
    { ...indoorLine, requestedCapacityBtu: 24000 },
    { ...outdoorLine, quantity: "2" },
    draftLine(header.id),
    { ...draftLine(control.id), parentItemId: indoorLine.id },
  ];
  currentState.value = await saveQuotation(api, quote.id, inputState.value);
  textsState.value = currentState.value.warnings.map(warning => warning.text).join("\n");
  for (const text of ["חנוכיות", "טרמוסטט", "דיוורסיטי", "12%", "פירוט", "90%"])
    expect(textsState.value).not.toContain(text);
});

test("MULTI piping and less-useful are required; GEN does not invent piping requirements", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture({
    systemType: QUOTATION.SYSTEM.MULTI,
    preference: "less",
  });
  const quote = await createQuotation(api, customer.id);
  const currentState = {
    value: await saveQuotation(api, quote.id, {
      ...quotationWrite(quote),
      brand: QUOTATION.BRAND,
      sections: [
        {
          id: randomUUID(),
          title: "Multi",
          systemType: QUOTATION.SYSTEM.MULTI,
          items: [draftLine(item.id)],
        },
      ],
    }),
  };
  expect(currentState.value.warnings.some(warning => warning.text.includes("צנרת"))).toBeTruthy();
  expect(
    currentState.value.warnings.some(warning => warning.text.includes("פחות שימושי")),
  ).toBeTruthy();
  const input = quotationWrite(currentState.value);
  input.sections[0]!.systemType = QUOTATION.SYSTEM.GENERAL;
  currentState.value = await saveQuotation(api, quote.id, input);
  expect(currentState.value.warnings.some(warning => warning.text.includes("צנרת"))).toBe(false);
});

test("discovery supports cursor pagination, search, status and defensive query limits", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const quote = await createQuotation(api, customer.id);
  const page = await api.send(
    "GET",
    `/quotation?search=${encodeURIComponent(quote.number)}&batchSize=1&status=draft`,
  );
  expect(page.ok()).toBeTruthy();
  const body = await quotationPage(page);
  expect(body.items.map((item: { id: string }) => item.id)).toContain(quote.id);
  const first = await quotationPage(await api.send("GET", "/quotation?batchSize=1"));
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).toBeTruthy();
  const next = await quotationPage(
    await api.send(
      "GET",
      `/quotation?batchSize=1&batchCursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    ),
  );
  expect(next.items[0]?.id).not.toBe(first.items[0]?.id);
  for (const path of [
    "/quotation?batchSize=9999",
    "/quotation?status=invalid",
    "/catalogue-item?capacityBtu=-1",
    "/catalogue-item?limit=9999",
  ])
    expect((await api.send("GET", path)).status()).toBe(400);
});

test("optional project linkage enforces selected customer and preserves independent quote identity", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const other = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const quote = await createQuotation(api, customer.id);
  const linked = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    projectId: project.id,
  });
  expect(linked.projectId).toBe(project.id);
  expect(linked.id).toBe(quote.id);
  expect(
    (
      await api.send("PUT", `/quotation/${quote.id}`, {
        ...quotationWrite(linked),
        customerId: other.id,
      })
    ).status(),
  ).toBe(400);
  const standalone = await saveQuotation(api, quote.id, {
    ...quotationWrite(linked),
    projectId: null,
  });
  expect(standalone.projectId).toBeNull();
  expect(standalone.id).toBe(quote.id);
});

test("live feature grants gate quotation read, update, approval and catalogue separately", async ({
  api,
  apiAs,
}) => {
  const customer = await seedCustomer(api);
  const quote = await createQuotation(api, customer.id);
  const engineer = await apiAs(TEST_USERS[USER_ROLES.ENGINEER]);
  await withRolePermissions(USER_ROLES.ENGINEER, ["quotations.read"], async () => {
    expect((await engineer.send("GET", `/quotation/${quote.id}`)).ok()).toBeTruthy();
    expect(
      (await engineer.send("PUT", `/quotation/${quote.id}`, quotationWrite(quote))).status(),
    ).toBe(403);
    expect(
      (
        await engineer.send("POST", `/quotation/${quote.id}/review`, {
          version: quote.version,
          status: QUOTATION.STATUS.REVIEW,
        })
      ).status(),
    ).toBe(403);
    expect(
      (
        await engineer.send("POST", `/quotation/${quote.id}/warnings`, {
          version: quote.version,
          warningKeys: [],
        })
      ).status(),
    ).toBe(403);
    expect((await engineer.send("GET", "/catalogue-item/maintenance")).status()).toBe(403);
    await withRolePermissions(USER_ROLES.ENGINEER, [], async () => {
      expect((await engineer.send("GET", `/quotation/${quote.id}`)).status()).toBe(403);
      expect((await engineer.send("GET", QUOTATION.RULE_PATH)).status()).toBe(403);
    });
    expect((await engineer.send("GET", `/quotation/${quote.id}`)).ok()).toBeTruthy();
  });
});

test("all five source duplicate SKU groups are imported into quarantine", async ({ api }) => {
  for (const sku of QUOTATION_DUPLICATE_SKUS) {
    const visible = await catalogueIds(
      await api.send("GET", `${QUOTATION.CATALOGUE_PATH}?search=${encodeURIComponent(sku)}`),
    );
    const response = await api.send(
      "GET",
      `${QUOTATION.CATALOGUE_PATH}/maintenance?search=${encodeURIComponent(sku)}`,
    );
    const value: unknown = await response.json();
    expect(response.ok()).toBeTruthy();
    if (!isRecord(value) || !Array.isArray(value.items))
      throw new Error("Invalid maintenance page");
    const items = value.items.filter((item: unknown) => isRecord(item) && item.sku === sku);
    expect(items).toHaveLength(2);
    expect(
      items.every(
        (item: unknown) =>
          isRecord(item) && typeof item.id === "string" && !visible.includes(item.id),
      ),
    ).toBe(true);
    expect(
      items.every(
        (item: unknown) => isRecord(item) && item.status === QUOTATION.CATALOGUE.CONFLICT,
      ),
    ).toBe(true);
  }
});

test("server recomputes VAT, percentage and target precedence using exact large decimals", async ({
  api,
}) => {
  const customer = await seedCustomer(api);
  const item = await createCatalogueFixture();
  const quote = await createQuotation(api, customer.id);
  const saved = await saveQuotation(api, quote.id, {
    ...quotationWrite(quote),
    brand: QUOTATION.BRAND,
    discountPercent: "10",
    sections: [
      {
        ...section(item.id),
        items: [{ ...draftLine(item.id, "999999999999.9999"), quantity: "2" }],
      },
    ],
  });
  expect(saved.totals.subtotal).toBe("2000000000000.00");
  expect(saved.totals.pretax).toBe("1800000000000.00");
  expect(saved.totals.vat).toBe("324000000000.00");
  expect(saved.totals.total).toBe("2124000000000.00");
  const target = await saveQuotation(api, quote.id, {
    ...quotationWrite(saved),
    targetPretaxAmount: "7.00",
  });
  expect(target.totals.pretax).toBe("7.00");
  expect(target.totals.vat).toBe("1.26");
  expect(target.totals.total).toBe("8.26");
});

test("concurrent quotation creation allocates distinct stable numbers", async ({ api }) => {
  const customer = await seedCustomer(api);
  const quotations = await Promise.all(
    Array.from({ length: 4 }, () => createQuotation(api, customer.id)),
  );
  expect(new Set(quotations.map(quote => quote.number)).size).toBe(4);
  expect(new Set(quotations.map(quote => quote.id)).size).toBe(4);
});
