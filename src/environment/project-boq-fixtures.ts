import { randomUUID } from "node:crypto";
import { USER_ROLES } from "../constants/user-role.constant.ts";
import { TEST_USERS } from "../constants/test-users.constant.ts";
import { createTestDatabaseClient } from "./test-database-client.ts";

export const seedNamedBoq = async (
  projectId: string,
  name: string,
  quantity = "2",
  cost = "125.25",
) => {
  const database = createTestDatabaseClient();
  const id = randomUUID();
  const materialId = randomUUID();
  const lineId = randomUUID();
  await database.connect();
  try {
    const actor = await database.query<{ id: string }>("SELECT id FROM users WHERE email=$1", [
      TEST_USERS[USER_ROLES.SYSTEM_ADMIN].email,
    ]);
    const actorId = actor.rows[0]?.id;
    if (!actorId) {
      throw new Error("Missing disposable administrator");
    }

    await database.query(
      "INSERT INTO materials(id,code,name,category,unit,status) VALUES($1,$2,'QA material','QA','unit','active')",
      [materialId, `QA-${materialId}`],
    );
    await database.query(
      "INSERT INTO project_boqs(id,project_id,name,revision,created_by_id,updated_by_id) VALUES($1,$2,$3,1,$4,$4)",
      [id, projectId, name, actorId],
    );
    await database.query(
      "INSERT INTO project_boq_lines(id,boq_id,material_id,source_key,material_code,material_name,material_category,material_unit,source_basis,required_quantity,estimated_unit_cost,review_state,display_order) VALUES($1,$2,$3,'manual:qa','QA','QA material','QA','unit','manual',$4,$5,'confirmed',0)",
      [lineId, id, materialId, quantity, cost],
    );
    return { id, lineId };
  } finally {
    await database.end();
  }
};

export const reviseNamedBoqCost = async (documentId: string, cost: string) => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    await database.query("BEGIN");
    await database.query("UPDATE project_boq_lines SET estimated_unit_cost=$1 WHERE boq_id=$2", [
      cost,
      documentId,
    ]);
    await database.query("UPDATE project_boqs SET revision=revision+1 WHERE id=$1", [documentId]);
    await database.query(
      "INSERT INTO project_boq_revisions (boq_id,revision,lines,created_by_id) SELECT b.id,b.revision,jsonb_agg(to_jsonb(l)),b.updated_by_id FROM project_boqs b JOIN project_boq_lines l ON l.boq_id=b.id WHERE b.id=$1 GROUP BY b.id",
      [documentId],
    );
    await database.query("COMMIT");
  } catch (error) {
    await database.query("ROLLBACK");
    throw error;
  } finally {
    await database.end();
  }
};
