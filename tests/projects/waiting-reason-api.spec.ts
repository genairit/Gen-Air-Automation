import {
  seedBuilding,
  seedCustomer,
  seedApartment,
  seedStandaloneProject,
} from "../../src/api/seed-data.ts";

import {
  sendStageMove,
  moveWithReason,
  readBoardItems,
  sendProjectUpdate,
  readApartmentItems,
  readTransitionNotes,
  readWaitingReasonProject,
  readWaitingReasonResponse,
  expectWaitingReasonRequired,
} from "../../src/api/stage-reason.api.ts";

import {
  countStageTransitions,
  remapArchivedOnHoldProject,
} from "../../src/environment/stage-reason-data.ts";

import {
  PROJECT_STATUS_IDS,
  STAGE_NOTE_MAX_LENGTH,
  ARCHIVED_ON_HOLD_STAGE_NAME,
} from "../../src/constants/stage-reason.constant.ts";

import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { HTTP_STATUS } from "../../src/constants/http.constant.ts";
import { createUniqueName } from "../../src/utilities/test-data.utility.ts";
import { PROJECT_STATUS_NAMES } from "../../src/constants/domain.constant.ts";

const REASON = "ממתינים לאישור התוכנית מהאדריכל";
const MIXED_REASON = "Waiting for ABC-123 approval מהלקוח";
const BLANK_NOTES = [null, "", "   \n\t "] as const;

test("moving into waiting requires a non-blank reason and rejects before writing", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const transitionsBefore = await countStageTransitions(project.id);

  for (const note of BLANK_NOTES) {
    const body = note === null ? {} : { note };
    await expectWaitingReasonRequired(
      await sendStageMove(api, project.id, {
        stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
        ...body,
      }),
    );
  }

  const tooLong = await sendStageMove(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: "א".repeat(STAGE_NOTE_MAX_LENGTH + 1),
  });
  expect(tooLong.status()).toBe(HTTP_STATUS.BAD_REQUEST);

  const stored = await readWaitingReasonProject(api, project.id);
  expect(stored.stageId).not.toBe(PROJECT_STATUS_IDS.WAITING_RESPONSE);
  expect(stored.waitingReason).toBeNull();
  expect(await countStageTransitions(project.id)).toBe(transitionsBefore);
});

test("a trimmed reason is stored, exposed as waitingReason everywhere and on the transition", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const edgeReason = `  ${"ק".repeat(STAGE_NOTE_MAX_LENGTH)}  `;

  const moved = await moveWithReason(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: edgeReason,
  });

  expect(moved).toMatchObject({
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    waitingReason: edgeReason.trim(),
  });
  expect((await readWaitingReasonProject(api, project.id)).waitingReason).toBe(edgeReason.trim());
  expect(await readBoardItems(api, project.code)).toEqual([
    expect.objectContaining({ id: project.id, waitingReason: edgeReason.trim() }),
  ]);
  const [latest] = await readTransitionNotes(api, project.id);
  expect(latest).toMatchObject({
    toStageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: edgeReason.trim(),
  });
});

test("other statuses move without a reason, keep optional notes and clear waitingReason", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const inProgress = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  const completed = await api.findProjectStage(PROJECT_STATUS_NAMES.COMPLETED);

  expect(await moveWithReason(api, project.id, { stageId: inProgress.id })).toMatchObject({
    stageId: inProgress.id,
    waitingReason: null,
  });
  await moveWithReason(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: REASON,
  });
  expect(
    await moveWithReason(api, project.id, { stageId: completed.id, note: `  ${MIXED_REASON} ` }),
  ).toMatchObject({ stageId: completed.id, waitingReason: null });

  const [latest, waiting, first] = await readTransitionNotes(api, project.id);
  expect(latest).toMatchObject({ toStageId: completed.id, note: MIXED_REASON });
  expect(waiting).toMatchObject({ toStageId: PROJECT_STATUS_IDS.WAITING_RESPONSE, note: REASON });
  expect(first).toMatchObject({ toStageId: inProgress.id, note: null });
});

test("a same-stage waiting move is a no-op and re-entering waiting shows the newest reason", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const inProgress = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  await moveWithReason(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: REASON,
  });
  const transitionsAfterMove = await countStageTransitions(project.id);

  expect(
    await moveWithReason(api, project.id, { stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE }),
  ).toMatchObject({ waitingReason: REASON });
  expect(await countStageTransitions(project.id)).toBe(transitionsAfterMove);

  await moveWithReason(api, project.id, { stageId: inProgress.id });
  expect((await readWaitingReasonProject(api, project.id)).waitingReason).toBeNull();
  await moveWithReason(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: MIXED_REASON,
  });
  expect((await readWaitingReasonProject(api, project.id)).waitingReason).toBe(MIXED_REASON);
});

test("project edit requires stageNote when changing into waiting and writes nothing without it", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const transitionsBefore = await countStageTransitions(project.id);
  const rejectedName = createUniqueName("לא נשמר");

  for (const stageNote of BLANK_NOTES) {
    const body = stageNote === null ? {} : { stageNote };
    await expectWaitingReasonRequired(
      await sendProjectUpdate(api, project.id, {
        name: rejectedName,
        stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
        ...body,
      }),
    );
  }
  const tooLong = await sendProjectUpdate(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    stageNote: "ב".repeat(STAGE_NOTE_MAX_LENGTH + 1),
  });
  expect(tooLong.status()).toBe(HTTP_STATUS.BAD_REQUEST);

  const unchanged = await api.getProject(project.id);
  expect(unchanged.name).toBe(project.name);
  expect(await countStageTransitions(project.id)).toBe(transitionsBefore);

  const updated = await readWaitingReasonResponse(
    await sendProjectUpdate(api, project.id, {
      stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
      stageNote: `  ${REASON}  `,
    }),
  );
  expect(updated).toMatchObject({
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    waitingReason: REASON,
  });
  expect((await readTransitionNotes(api, project.id))[0]).toMatchObject({
    toStageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: REASON,
  });

  const renamed = createUniqueName("נשמר");
  const unchangedStage = await sendProjectUpdate(api, project.id, {
    name: renamed,
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
  });
  expect(unchangedStage.status()).toBe(HTTP_STATUS.OK);
  expect(await countStageTransitions(project.id)).toBe(transitionsBefore + 1);
});

test("apartments follow the same rule and list items expose their own waitingReason", async ({
  api,
}) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const waiting = await seedApartment(api, building);
  const other = await seedApartment(api, building);
  const edited = await seedApartment(api, building);

  await expectWaitingReasonRequired(
    await sendStageMove(api, waiting.id, { stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE }),
  );
  await expectWaitingReasonRequired(
    await sendProjectUpdate(api, edited.id, { stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE }),
  );
  await moveWithReason(api, waiting.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: REASON,
  });
  await readWaitingReasonResponse(
    await sendProjectUpdate(api, edited.id, {
      stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
      stageNote: MIXED_REASON,
    }),
  );

  const items = await readApartmentItems(api, building.id);
  expect(items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: waiting.id, waitingReason: REASON }),
      expect.objectContaining({ id: other.id, waitingReason: null }),
      expect.objectContaining({ id: edited.id, waitingReason: MIXED_REASON }),
    ]),
  );
  expect((await readWaitingReasonProject(api, building.id)).waitingReason).toBeNull();
});

test("create responses expose a null waitingReason", async ({ api }) => {
  const building = await seedBuilding(api, await seedCustomer(api));
  const apartment = await seedApartment(api, building);

  expect(building).toHaveProperty("waitingReason", null);
  expect(apartment).toHaveProperty("waitingReason", null);
});

test("a migrated On Hold project reads its archived reason until a newer waiting reason", async ({
  api,
}) => {
  const project = await seedStandaloneProject(api, await seedCustomer(api));
  const empty = await seedStandaloneProject(api, await seedCustomer(api));
  const archivedReason = createUniqueName("סיבה מארכיון");
  await remapArchivedOnHoldProject({
    projectId: project.id,
    note: archivedReason,
    changedById: api.session.user.id,
  });
  await remapArchivedOnHoldProject({
    note: null,
    projectId: empty.id,
    changedById: api.session.user.id,
  });

  expect(await readWaitingReasonProject(api, project.id)).toMatchObject({
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    waitingReason: archivedReason,
  });
  expect((await readWaitingReasonProject(api, empty.id)).waitingReason).toBeNull();
  const [archived] = await readTransitionNotes(api, project.id);
  expect(archived).toMatchObject({
    note: archivedReason,
    toStageId: PROJECT_STATUS_IDS.ARCHIVED_ON_HOLD,
    toStage: expect.objectContaining({ name: ARCHIVED_ON_HOLD_STAGE_NAME }),
  });

  const inProgress = await api.findProjectStage(PROJECT_STATUS_NAMES.IN_PROGRESS);
  await moveWithReason(api, project.id, { stageId: inProgress.id });
  await moveWithReason(api, project.id, {
    stageId: PROJECT_STATUS_IDS.WAITING_RESPONSE,
    note: REASON,
  });
  expect((await readWaitingReasonProject(api, project.id)).waitingReason).toBe(REASON);
});
