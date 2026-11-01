import { randomUUID } from "node:crypto";
import { QUOTATION } from "../constants/quotation.constant.ts";
import { createTestDatabaseClient } from "./test-database-client.ts";
import type { ICatalogueFixture } from "../interfaces/quotation.interface.ts";

export const createCatalogueFixture = async (
  overrides: Partial<ICatalogueFixture> = {},
): Promise<ICatalogueFixture> => {
  const item: ICatalogueFixture = {
    id: randomUUID(),
    sku: `QA-${randomUUID()}`,
    description: "QA equipment",
    unit: "יח׳",
    price: "10.0050",
    capacityBtu: 24000,
    brand: QUOTATION.BRAND,
    systemType: QUOTATION.SYSTEM.SINGLE,
    equipmentRole: QUOTATION.ROLE.UNIT,
    equipmentTypes: [],
    status: QUOTATION.CATALOGUE.ACTIVE,
    preference: "",
    includesRemote: false,
    includesThermostat: false,
    ...overrides,
  };
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      `INSERT INTO catalogue_items(id,sku,description,unit,price,capacity_btu,brand,system_type,equipment_role,equipment_types,status,preference,includes_remote,includes_thermostat) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [
        item.id,
        item.sku,
        item.description,
        item.unit,
        item.price,
        item.capacityBtu,
        item.brand,
        item.systemType,
        item.equipmentRole,
        JSON.stringify(item.equipmentTypes),
        item.status,
        item.preference,
        item.includesRemote,
        item.includesThermostat,
      ],
    );
    return item;
  } finally {
    await database.end();
  }
};

export const withQuotationRuleVersionChange = async <T>(
  key: string,
  run: () => Promise<T>,
): Promise<T> => {
  const database = createTestDatabaseClient();
  await database.connect();
  const original = await database.query<{ version: number }>(
    "SELECT version FROM quotation_rules WHERE key=$1",
    [key],
  );
  if (!original.rows[0]) {
    await database.end();
    throw new Error(`Missing rule ${key}`);
  }
  try {
    await database.query("UPDATE quotation_rules SET version=version+1 WHERE key=$1", [key]);
    return await run();
  } finally {
    try {
      await database.query("UPDATE quotation_rules SET version=$1 WHERE key=$2", [
        original.rows[0].version,
        key,
      ]);
    } finally {
      await database.end();
    }
  }
};
