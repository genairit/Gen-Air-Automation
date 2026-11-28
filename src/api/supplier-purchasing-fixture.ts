import {
  saveQuotation,
  quotationWrite,
  createQuotation,
  quotationDocument,
} from "./quotation.api.ts";

import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "./gen-air-api.ts";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { QUOTATION } from "../constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../constants/domain.constant.ts";
import { seedCustomer, seedStandaloneProject } from "./seed-data.ts";
import { createCatalogueFixture } from "../environment/quotation-fixtures.ts";

const requireId = (value: unknown): string => {
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Expected an ID from purchasing fixture API");
  }
  return value.id;
};

export const createSupplierPurchasingProject = async (api: TGenAirApi) => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const catalogue = await createCatalogueFixture();
  const materialCode = `SUP-QA-${randomUUID().toUpperCase()}`;
  const materialResponse = await api.send(HTTP_METHODS.POST, "/material", {
    code: materialCode,
    name: `חומר ספק ${materialCode}`,
    category: "QA ספקים",
    specification: "מפרט בדיקת ספק",
    unit: "unit",
    status: "active",
  });
  if (materialResponse.status() !== 201) {
    throw new Error("Could not create fixture material");
  }
  const materialId = requireId(await materialResponse.json());
  const breakdown = await api.send(HTTP_METHODS.PUT, `/catalogue-item/${catalogue.id}/materials`, {
    expectedRevision: 0,
    lines: [{ materialId, basis: "fixed", quantityPerItem: "5", displayOrder: 0 }],
  });
  if (breakdown.status() !== 200) {
    throw new Error("Could not create fixture breakdown");
  }
  const initial = await createQuotation(api, customer.id, project.id);
  const draft = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    projectId: project.id,
    brand: QUOTATION.BRAND,
    paymentTerms: PAYMENT_TERMS.PREPAID,
    sections: [
      {
        id: randomUUID(),
        title: "QA supplier system",
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
    throw new Error("Could not preview fixture BOQ");
  }
  const preview: unknown = await previewResponse.json();
  if (!isRecord(preview) || typeof preview.fingerprint !== "string") {
    throw new Error("Invalid fixture BOQ preview");
  }
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
    throw new Error("Could not generate fixture BOQ");
  }
  const generated: unknown = await generatedResponse.json();
  if (!isRecord(generated) || !Array.isArray(generated.lines)) {
    throw new Error("Invalid generated fixture BOQ");
  }
  const line = generated.lines.find(value => isRecord(value) && value.materialId === materialId);
  if (!isRecord(line) || typeof line.id !== "string" || typeof line.sourceKey !== "string") {
    throw new Error("Expected fixture BOQ material line");
  }
  return { project, materialId, materialCode, lineId: line.id, sourceKey: line.sourceKey };
};
