import { join } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import { MIGRATION_STAGES } from "../constants/migration.constant.ts";

interface IStageExecutor {
  query: (sql: string) => Promise<unknown>;
}

export const applyStagedMigrations = async (directory: string, database: IStageExecutor) => {
  const entries = await readdir(directory, { withFileTypes: true });
  const sprints = entries
    .filter(entry => entry.isDirectory() && entry.name.startsWith("sprint-"))
    .map(entry => entry.name)
    .sort();

  for (const sprint of sprints) {
    for (const stage of Object.values(MIGRATION_STAGES)) {
      try {
        await database.query(await readFile(join(directory, sprint, stage), "utf8"));
        await database.query("COMMIT");
      } catch (error) {
        await database.query("ROLLBACK");
        throw error;
      }
    }
  }
};
