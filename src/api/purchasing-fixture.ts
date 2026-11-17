import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "./quotation.api.ts";

import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { QUOTATION } from "../constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../constants/domain.constant.ts";
import { seedCustomer, seedStandaloneProject } from "./seed-data.ts";
import { createCatalogueFixture } from "../environment/quotation-fixtures.ts";
import { MATERIAL_STATUS, MATERIAL_BASIS } from "../constants/purchasing.constant.ts";

export const purchaseRecord = async (response: APIResponse): Promise<Record<string, unknown>> => {
  const value: unknown = await response.json();
  if (!isRecord(value)) {
    throw new Error(`Expected object response, got ${response.status()}`);
  }

  return value;
};

export const purchaseLines = (value: Record<string, unknown>): Record<string, unknown>[] => {
  if (!Array.isArray(value.lines) || !value.lines.every(isRecord)) {
    throw new Error("Expected purchasing lines");
  }
  return value.lines;
};

export const purchaseHistory = (value: Record<string, unknown>): Record<string, unknown>[] => {
  if (!Array.isArray(value.history) || !value.history.every(isRecord)) {
    throw new Error("Expected purchasing history");
  }
  return value.history;
};

const idOf = (value: Record<string, unknown>): string => {
  if (typeof value.id !== "string") {
    throw new Error("Expected ID");
  }

  return value.id;
};

export const seedPurchasingProject = async (api: TGenAirApi) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const catalogue = await createCatalogueFixture();
  const materials = await Promise.all(
    ["צנרת QA", "בידוד QA"].map(async category => {
      const code = `PUR-${randomUUID().toUpperCase()}`;
      const created = await api.send(HTTP_METHODS.POST, "/material", {
        code,
        name: `חומר ${category} ${code}`,
        category,
        specification: "QA spec",
        unit: "unit",
        status: MATERIAL_STATUS.ACTIVE,
      });
      if (created.status() !== 201) {
        throw new Error(`Material setup failed: ${created.status()}`);
      }

      return { id: idOf(await purchaseRecord(created)), code, category };
    }),
  );
  const breakdown = await api.send(HTTP_METHODS.PUT, `/catalogue-item/${catalogue.id}/materials`, {
    expectedRevision: 0,
    lines: materials.map((material, index) => ({
      materialId: material.id,
      basis: MATERIAL_BASIS.FIXED,
      quantityPerItem: "5",
      displayOrder: index,
    })),
  });
  if (breakdown.status() !== 200) {
    throw new Error(`Breakdown setup failed: ${breakdown.status()}`);
  }

  const initial = await createQuotation(api, customer.id);
  const draft = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    projectId: project.id,
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "QA system",
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: [
          {
            id: randomUUID(),
            catalogueItemId: catalogue.id,
            parentItemId: null,
            description: catalogue.description,
            quotedPrice: catalogue.price,
            quantity: "2",
            location: "QA room",
            circuit: null,
            requestedCapacityBtu: catalogue.capacityBtu,
          },
        ],
      },
    ],
  });
  const review = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: draft.version,
      status: QUOTATION.STATUS.REVIEW,
    }),
  );
  const acknowledged = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/warnings`, {
      version: review.version,
      warningKeys: review.warnings.map(warning => warning.key),
    }),
  );
  const approved = await quotationDocument(
    await api.send(HTTP_METHODS.POST, `/quotation/${draft.id}/review`, {
      version: acknowledged.version,
      status: QUOTATION.STATUS.APPROVED,
    }),
  );
  const previewResponse = await api.send(
    HTTP_METHODS.GET,
    `/project-boq/${project.id}/preview?quotationId=${approved.id}`,
  );
  if (previewResponse.status() !== 200) {
    throw new Error(`BOQ preview failed: ${previewResponse.status()}`);
  }

  const preview = await purchaseRecord(previewResponse);
  const generatedResponse = await api.send(
    HTTP_METHODS.POST,
    `/project-boq/${project.id}/generate`,
    {
      quotationId: approved.id,
      quotationVersion: approved.version,
      previewFingerprint: preview.fingerprint,
      expectedRevision: 0,
    },
  );
  if (generatedResponse.status() !== 201) {
    throw new Error(`BOQ generation failed: ${generatedResponse.status()}`);
  }

  const generated = await purchaseRecord(generatedResponse);
  const lines = purchaseLines(generated);
  return {
    project,
    materials,
    lines: materials.map(material => {
      const line = lines.find(candidate => candidate.materialId === material.id);
      if (!line || typeof line.id !== "string") {
        throw new Error("Generated material line missing");
      }

      return { id: line.id, material };
    }),
  };
};
