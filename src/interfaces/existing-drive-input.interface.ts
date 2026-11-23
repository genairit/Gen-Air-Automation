import type { buildProjectInput } from "../api/seed-data.ts";

export interface ILinkedProjectInput extends ReturnType<typeof buildProjectInput> {
  existingDriveFolder: string;
}
