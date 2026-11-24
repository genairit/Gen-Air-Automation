import type {
  IPublicationProof,
  IPublicationEffect,
} from "../interfaces/quotation-publication.interface.ts";

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { isRecord } from "../utilities/guard.utility.ts";
import { createTestDatabaseClient } from "./test-database-client.ts";
import { AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";
import { PUBLICATION_EFFECT } from "../constants/quotation-publication.constant.ts";

export const publicationDirectory = join(AUTOMATION_DIRECTORIES.DATABASE, "fake-drive");

const publicationIdentity = (
  value: Record<string, unknown>,
): Pick<IPublicationEffect, "cycleId" | "quotationId"> => {
  const properties = isRecord(value.properties) ? value.properties : {};
  return {
    cycleId: typeof properties.publicationCycle === "string" ? properties.publicationCycle : null,
    quotationId:
      typeof properties.publicationQuotation === "string" ? properties.publicationQuotation : null,
  };
};

const retainedPublicationEffect = (
  value: Record<string, unknown>,
  id: string,
): IPublicationEffect => {
  if (typeof value.md5 !== "string" || typeof value.revisionId !== "string") {
    throw new Error("Retained revision proof is missing");
  }

  return {
    id,
    ...publicationIdentity(value),
    action: PUBLICATION_EFFECT.RETAIN,
    name: "",
    mimeType: "application/pdf",
    parents: [],
    md5: value.md5,
    revisionId: value.revisionId,
  };
};

const parsePublicationEffect = (row: string): IPublicationEffect => {
  const value: unknown = JSON.parse(row);
  if (!isRecord(value) || typeof value.id !== "string") {
    throw new Error("Invalid fake publication effect");
  }

  const action = Object.values(PUBLICATION_EFFECT).find(
    (candidate): boolean => candidate === value.action,
  );
  if (action == null) {
    throw new Error("Unknown fake publication effect");
  }

  if (action === PUBLICATION_EFFECT.RETAIN) {
    return retainedPublicationEffect(value, value.id);
  }

  const { name, mimeType, parents } = value;
  const hasNameAndMime = typeof name === "string" && typeof mimeType === "string";
  const hasParents =
    Array.isArray(parents) &&
    parents.every((parent): parent is string => typeof parent === "string");
  if (!hasNameAndMime || !hasParents) {
    throw new Error("Incomplete fake publication effect");
  }

  return {
    id: value.id,
    action,
    ...publicationIdentity(value),
    name,
    mimeType,
    parents,
    md5: typeof value.md5 === "string" ? value.md5 : null,
    revisionId: typeof value.revisionId === "string" ? value.revisionId : null,
  };
};

export const publicationEffects = async (): Promise<IPublicationEffect[]> => {
  try {
    const text = await readFile(join(publicationDirectory, "publication-effects.jsonl"), "utf8");
    return text.trim().split("\n").filter(Boolean).map(parsePublicationEffect);
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
};
export const quotationPublicationEffects = async (id: string): Promise<IPublicationEffect[]> =>
  (await publicationEffects()).filter((effect): boolean => effect.quotationId === id);

export const publicationBytes = (effect: IPublicationEffect): Promise<Buffer> =>
  readFile(join(publicationDirectory, `${effect.id}-${effect.revisionId}.pdf`));

export const acceptedPublicationProof = async (id: string): Promise<IPublicationProof> => {
  const database = createTestDatabaseClient();
  await database.connect();
  try {
    const result = await database.query<IPublicationProof>(
      `SELECT c.id AS "cycleId",c.file_id AS "fileId",o.hash,o.source_version AS "sourceVersion",
        o.snapshot->'source'->>'version' AS "sourceSnapshotVersion",
        o.snapshot->'source'->'sections'->0->'items'->0->>'id' AS "lineId",
        o.snapshot->'source'->'sections'->0->'items'->0->>'quantity' AS "sourceQuantity",
        o.snapshot->'document'->'sections'->0->'lines'->0->>'quantity' AS "documentQuantity",
        o.snapshot->'document'->'metadata'->>'revision' AS "documentVersion"
       FROM quotation_publication_cycles c JOIN quotation_publication_operations o ON o.cycle_id=c.id
       WHERE c.quotation_id=$1 AND o.hash=c.actual_hash ORDER BY c.updated_at DESC LIMIT 1`,
      [id],
    );
    const proof = result.rows[0];
    if (!proof) {
      throw new Error("Accepted publication proof is missing");
    }

    return proof;
  } finally {
    await database.end();
  }
};
