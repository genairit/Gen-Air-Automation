import { randomUUID } from "node:crypto";
import type { TGenAirApi } from "./gen-air-api.ts";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { QUOTATION } from "../constants/quotation.constant.ts";
import { PAYMENT_TERMS } from "../constants/domain.constant.ts";
import { buildCustomerInput, seedStandaloneProject } from "./seed-data.ts";
import type { IQuotationWriteLine } from "../interfaces/quotation.interface.ts";
import { saveQuotation, quotationWrite, createQuotation } from "./quotation.api.ts";

interface IQuotationCatalogueLineOptions {
  sku: string;
  circuit?: string;
  quantity: string;
  location: string;
}

const catalogueLine = async (
  api: TGenAirApi,
  options: IQuotationCatalogueLineOptions,
): Promise<IQuotationWriteLine> => {
  const response = await api.send(
    HTTP_METHODS.GET,
    `${QUOTATION.CATALOGUE_PATH}?search=${encodeURIComponent(options.sku)}&brand=${encodeURIComponent(QUOTATION.BRAND)}`,
  );
  const rows: unknown = await response.json();
  if (!response.ok() || !Array.isArray(rows)) {
    throw new Error(`Cannot read visual fixture catalogue ${response.status()}`);
  }

  const item: unknown = rows.find(row => isRecord(row) && row.sku === options.sku);
  if (
    !isRecord(item) ||
    typeof item.id !== "string" ||
    typeof item.price !== "string" ||
    typeof item.description !== "string" ||
    (item.capacityBtu !== null && typeof item.capacityBtu !== "number")
  ) {
    throw new Error(`Missing reference catalogue item ${options.sku}`);
  }

  return {
    id: randomUUID(),
    catalogueItemId: item.id,
    parentItemId: null,
    description: item.description,
    quotedPrice: item.price,
    quantity: options.quantity,
    location: options.location,
    circuit: options.circuit ?? null,
    requestedCapacityBtu: item.capacityBtu,
  };
};

export const seedQuotationDesign = async (api: TGenAirApi) => {
  const customer = await api.createCustomer({
    ...buildCustomerInput(),
    paymentTerms: PAYMENT_TERMS.PREPAID,
  });
  const project = await seedStandaloneProject(api, customer);
  const initial = await createQuotation(api, customer.id);
  const items = await Promise.all(
    [
      { sku: "E-SMD-63", quantity: "1", location: "סלון ומטבח", circuit: "A" },
      { sku: "E-SLD-25", quantity: "2", location: "חדרי ילדים", circuit: "A" },
      { sku: "E-HWM-32", quantity: "1", location: "ממ״ד", circuit: "A" },
      { sku: "ELVOMV8PI-6", quantity: "1", location: "מעגל A", circuit: "A" },
      { sku: "PL-VRF1", quantity: "1", location: "חנוכיות" },
    ].map(options => catalogueLine(api, options)),
  );
  const controls = await Promise.all(
    items.slice(0, 2).map(async parent => ({
      ...(await catalogueLine(api, {
        sku: "ELRTC-29B",
        quantity: parent.quantity,
        location: parent.location,
      })),
      parentItemId: parent.id,
    })),
  );
  const singleItems = await Promise.all(
    [
      { sku: "CLASSIC INV 170", quantity: "1", location: "חדר עבודה" },
      { sku: "AC123", quantity: "8", location: "צנרת" },
    ].map(options => catalogueLine(api, options)),
  );
  const quotation = await saveQuotation(api, initial.id, {
    ...quotationWrite(initial),
    projectId: project.id,
    brand: QUOTATION.BRAND,
    paymentTerms: null,
    paymentSchedule: [
      { percent: "30", text: "במועד החתימה על החוזה / הזמנה" },
      { percent: "60", text: "במועד אספקת המאיידים" },
      { percent: "10", text: "במועד מסירת ההזמנה" },
    ],
    sections: [
      {
        id: randomUUID(),
        title: "קומה 3",
        systemType: QUOTATION.SYSTEM.VRF,
        items: [...items, ...controls],
      },
      {
        id: randomUUID(),
        title: "חדר עבודה",
        systemType: QUOTATION.SYSTEM.SINGLE,
        items: singleItems,
      },
    ],
  });
  return { quotation, customer, project };
};
