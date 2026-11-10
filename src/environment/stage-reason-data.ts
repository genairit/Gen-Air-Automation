import { createTestDatabaseClient } from "./test-database-client.ts";
import { PROJECT_STATUS_IDS } from "../constants/stage-reason.constant.ts";

interface IArchivedWaitingFixture {
  projectId: string;
  changedById: string;
  note: string | null;
}

const WITHOUT_TRANSITION = "UPDATE projects SET stage_id = $2 WHERE id = $1";

// Reproduces the four-status migration in the disposable database: a project whose last
// transition went into the archived "להמתין" stage is remapped to waiting without a new transition.
export const remapArchivedOnHoldProject = async ({
  note,
  projectId,
  changedById,
}: IArchivedWaitingFixture): Promise<void> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query(
      `INSERT INTO project_stage_transitions
         (project_id, from_stage_id, to_stage_id, changed_by_id, changed_by_role, note)
       SELECT id, stage_id, $2, $3, 'system_admin', $4 FROM projects WHERE id = $1`,
      [projectId, PROJECT_STATUS_IDS.ARCHIVED_ON_HOLD, changedById, note],
    );
    await database.query(WITHOUT_TRANSITION, [projectId, PROJECT_STATUS_IDS.WAITING_RESPONSE]);
  } finally {
    await database.end();
  }
};

export const countStageTransitions = async (projectId: string): Promise<number> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<{ count: string }>(
      "SELECT count(*) FROM project_stage_transitions WHERE project_id = $1",
      [projectId],
    );

    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await database.end();
  }
};
