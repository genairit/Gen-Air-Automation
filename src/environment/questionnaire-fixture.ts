import { randomUUID } from "node:crypto";
import { createTestDatabaseClient } from "./test-database-client.ts";
import { QUESTIONNAIRE } from "../constants/questionnaire.constant.ts";

interface IQuestionnaireRow {
  id: string;
  definition: Array<{ key: string }>;
}

export const activateQuestionnaire = async (): Promise<IQuestionnaireRow> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<IQuestionnaireRow>(
      "UPDATE questionnaires SET accepting_responses = TRUE WHERE slug = $1 AND version = $2 RETURNING id, definition",
      [QUESTIONNAIRE.SLUG, QUESTIONNAIRE.VERSION],
    );
    const row = result.rows[0];
    if (!row) {
      throw new Error("Questionnaire seed is missing from the disposable test database");
    }
    return row;
  } finally {
    await database.end();
  }
};

export const submissionInput = (questionnaireId: string) => ({
  questionnaireId,
  requestId: randomUUID(),
  fullName: `QA ${randomUUID()}`,
  role: "תפקיד בדיקה",
  department: "מחלקת בדיקה",
  answers: QUESTIONNAIRE.KEYS.map((questionKey, index) => ({
    questionKey,
    value: index === 0 ? "  תשובה מקורית\nשורה נוספת  " : "",
  })),
});

export const readQuestionnaireSubmissions = async (fullName: string) => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    return (
      await database.query<{
        id: string;
        full_name: string;
        questionnaire_id: string;
        answers: Array<{ questionKey: string; value: string }>;
      }>(
        "SELECT id, full_name, questionnaire_id, answers FROM questionnaire_submissions WHERE full_name = $1",
        [fullName],
      )
    ).rows;
  } finally {
    await database.end();
  }
};
