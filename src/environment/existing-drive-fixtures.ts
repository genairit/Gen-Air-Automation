import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { isRecord } from "../utilities/guard.utility.ts";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";
import type { ILegacyDriveTree } from "../interfaces/legacy-drive.interface.ts";
import type { ILegacyDriveItem } from "../interfaces/legacy-drive.interface.ts";

export const EXISTING_DRIVE = {
  ROOT: "qa-drive-root",
  FOLDER: "application/vnd.google-apps.folder",
  PDF: "application/pdf",
  PREVIEW: "/project-drive/existing-folder/preview",
  RESIDENTS: "דיירים",
  QUOTATIONS: "הצעות מחיר",
} as const;

const directory = join(AUTOMATION_DIRECTORIES.DATABASE, "fake-drive");

export const legacyDriveItem = (
  name: string,
  parentId: string | null = EXISTING_DRIVE.ROOT,
  mimeType: string = EXISTING_DRIVE.FOLDER,
): ILegacyDriveItem => ({
  name,
  mimeType,
  id: `legacy-${randomUUID()}`,
  parents: parentId ? [parentId] : [],
  trashed: false,
  version: "1",
});

export const registerLegacyDriveItems = async (items: ILegacyDriveItem[]): Promise<void> => {
  await mkdir(directory, { recursive: true });
  await appendFile(
    join(directory, "existing-folder-fixtures.jsonl"),
    `${JSON.stringify({ items })}\n`,
  );
};

export const legacyDriveTree = async (
  name: string = "תיקיית פרויקט קיימת",
): Promise<ILegacyDriveTree> => {
  const root = legacyDriveItem(name);
  const quotations = legacyDriveItem(EXISTING_DRIVE.QUOTATIONS, root.id);
  const file = legacyDriveItem("מסמך קיים.pdf", root.id, EXISTING_DRIVE.PDF);
  const residents = legacyDriveItem(EXISTING_DRIVE.RESIDENTS, root.id);
  const firstApartment = legacyDriveItem("דירה קיימת ראשונה", residents.id);
  const secondApartment = legacyDriveItem("דירה קיימת שנייה", residents.id);
  const nested = legacyDriveItem("תיקיית משנה פרטית", root.id);
  const items = [root, quotations, file, residents, firstApartment, secondApartment, nested];
  await registerLegacyDriveItems(items);
  return { root, quotations, file, residents, firstApartment, secondApartment, nested, items };
};

export const readFolderCreations = async (): Promise<ILegacyDriveItem[]> => {
  try {
    const text = await readFile(join(directory, "folder-creations.jsonl"), "utf8");
    return text
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((row: string) => {
        const value: unknown = JSON.parse(row);
        if (
          !isRecord(value) ||
          typeof value.id !== "string" ||
          typeof value.name !== "string" ||
          !Array.isArray(value.parents) ||
          !value.parents.every(parent => typeof parent === "string")
        ) {
          throw new Error("Fake Drive creation record malformed");
        }
        return {
          id: value.id,
          name: value.name,
          parents: value.parents,
          mimeType: EXISTING_DRIVE.FOLDER,
          trashed: false,
          version: "1",
        };
      });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};
