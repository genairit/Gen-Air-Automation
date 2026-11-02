import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import type { buildCustomerInput } from "../api/seed-data.ts";
import { createApartmentNumber } from "./apartment-fixture.utility.ts";
import { APARTMENT_IMPORT } from "../constants/apartment-import.constant.ts";

type TImportCustomer = ReturnType<typeof buildCustomerInput>;

export const buildImportRow = (
  customer: TImportCustomer,
  apartment = createApartmentNumber(),
): string[] => [
  "1",
  apartment,
  APARTMENT_IMPORT.OWNER,
  customer.name,
  customer.phone,
  customer.email,
  APARTMENT_IMPORT.CONTACT_NAME,
  APARTMENT_IMPORT.CONTACT_PHONE,
  APARTMENT_IMPORT.CONTACT_EMAIL,
  "120.50",
  APARTMENT_IMPORT.CUSTOMER_TYPE,
  customer.taxId,
  customer.address,
];

export const makeImportWorkbook = async (
  rows: readonly string[][],
  headers: readonly string[] = APARTMENT_IMPORT.HEADERS,
): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(APARTMENT_IMPORT.SHEET);
  sheet.addRow([...headers]);
  rows.forEach(row => sheet.addRow([...row]));
  return Buffer.from(await workbook.xlsx.writeBuffer());
};

export const readImportWorkbook = async (buffer: Buffer): Promise<ExcelJS.Workbook> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from([buffer]));
  return workbook;
};

export const importPath = (buildingId: string): string =>
  `/project/${buildingId}/apartments/import`;
export const contactsPath = (customerId: string): string => `/customer/${customerId}/contacts`;
