import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";

export const relocateApartmentFolderToLegacyRoot = async (folderId: string): Promise<void> => {
  const directory = join(AUTOMATION_DIRECTORIES.DATABASE, "fake-drive");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, `legacy-${folderId}`), "", { flag: "wx" });
};
