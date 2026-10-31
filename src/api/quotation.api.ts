import type { TGenAirApi } from "./gen-air-api.ts";
import type { APIResponse } from "@playwright/test";
import { isRecord } from "../utilities/guard.utility.ts";
import { QUOTATION } from "../constants/quotation.constant.ts";
import type { IQuotationDocument, IQuotationWrite } from "../interfaces/quotation.interface.ts";

const strings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every(key => typeof value[key] === "string");
const nullableStrings = (value: Record<string, unknown>, keys: string[]) =>
  keys.every(key => value[key] === null || typeof value[key] === "string");
const isLine = (value: unknown) =>
  isRecord(value) &&
  strings(value, [
    "id",
    "sku",
    "unit",
    "quantity",
    "location",
    "quotedPrice",
    "description",
    "catalogueItemId",
    "equipmentRole",
    "catalogueStatus",
  ]) &&
  nullableStrings(value, ["circuit", "controlKind", "parentItemId"]) &&
  typeof value.includesRemote === "boolean" &&
  typeof value.includesThermostat === "boolean" &&
  [value.capacityBtu, value.requestedCapacityBtu].every(
    capacity => capacity === null || typeof capacity === "number",
  );
const isSection = (value: unknown) =>
  isRecord(value) &&
  strings(value, ["id", "title"]) &&
  Object.values(QUOTATION.SYSTEM).some(system => system === value.systemType) &&
  Array.isArray(value.items) &&
  value.items.every(isLine);
const isWarning = (value: unknown) =>
  isRecord(value) && strings(value, ["key", "text"]) && typeof value.acknowledged === "boolean";
const isSchedule = (value: unknown) => isRecord(value) && strings(value, ["percent", "text"]);
const isQuotationDocument = (value: unknown): value is IQuotationDocument =>
  isRecord(value) &&
  strings(value, [
    "id",
    "number",
    "customerId",
    "date",
    "brand",
    "vatRate",
    "internalNotes",
    "discountPercent",
    "paymentTermsNote",
    "ruleConfigFingerprint",
  ]) &&
  nullableStrings(value, [
    "projectId",
    "paymentTerms",
    "approvedById",
    "approvedAt",
    "targetPretaxAmount",
  ]) &&
  Object.values(QUOTATION.STATUS).some(status => status === value.status) &&
  typeof value.version === "number" &&
  Array.isArray(value.sections) &&
  value.sections.every(isSection) &&
  Array.isArray(value.warnings) &&
  value.warnings.every(isWarning) &&
  Array.isArray(value.paymentSchedule) &&
  value.paymentSchedule.every(isSchedule) &&
  isRecord(value.totals) &&
  strings(value.totals, ["subtotal", "discount", "pretax", "vat", "total"]);

export const catalogueIds = async (response: APIResponse): Promise<string[]> => {
  const value: unknown = await response.json();
  if (!response.ok() || !Array.isArray(value))
    throw new Error(`Invalid catalogue ${response.status()}`);
  return value.map(item => {
    if (!isRecord(item) || typeof item.id !== "string") throw new Error("Invalid catalogue item");
    return item.id;
  });
};
export const quotationPage = async (
  response: APIResponse,
): Promise<{ items: IQuotationDocument[]; nextCursor: string | null }> => {
  const value: unknown = await response.json();
  if (
    !response.ok() ||
    !isRecord(value) ||
    !Array.isArray(value.items) ||
    !value.items.every(isQuotationDocument) ||
    (value.nextCursor !== null && typeof value.nextCursor !== "string")
  )
    throw new Error(`Invalid quotation page ${response.status()}`);
  return { items: value.items, nextCursor: value.nextCursor };
};

export const quotationDocument = async (response: APIResponse): Promise<IQuotationDocument> => {
  const value: unknown = await response.json();
  if (!response.ok() || !isQuotationDocument(value))
    throw new Error(`Invalid quotation response ${response.status()}: ${JSON.stringify(value)}`);
  return value;
};
export const quotationWrite = (quote: IQuotationDocument): IQuotationWrite => ({
  version: quote.version,
  customerId: quote.customerId,
  projectId: quote.projectId,
  date: quote.date,
  brand: quote.brand,
  paymentTerms: quote.paymentTerms,
  paymentTermsNote: quote.paymentTermsNote,
  paymentSchedule: quote.paymentSchedule,
  discountPercent: quote.discountPercent,
  targetPretaxAmount: quote.targetPretaxAmount,
  internalNotes: quote.internalNotes,
  sections: quote.sections.map(section => ({
    id: section.id,
    title: section.title,
    systemType: section.systemType,
    items: section.items.map(item => ({
      id: item.id,
      catalogueItemId: item.catalogueItemId,
      parentItemId: item.parentItemId,
      description: item.description,
      quotedPrice: item.quotedPrice,
      quantity: item.quantity,
      location: item.location,
      circuit: item.circuit,
      requestedCapacityBtu: item.requestedCapacityBtu,
    })),
  })),
});
export const createQuotation = async (api: TGenAirApi, customerId: string) =>
  quotationDocument(await api.send("POST", "/quotation", { customerId }));
export const saveQuotation = async (api: TGenAirApi, id: string, input: IQuotationWrite) =>
  quotationDocument(await api.send("PUT", `/quotation/${id}`, input));
