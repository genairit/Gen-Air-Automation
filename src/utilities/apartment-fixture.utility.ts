import { randomInt } from "node:crypto";
import { test } from "@playwright/test";
import { createSequenceNumber } from "./test-data.utility.ts";

const APARTMENT_FIXTURE = {
  MINIMUM_BASE: 1_000_000,
  MAXIMUM_BASE: 8_000_000,
  WORKER_RANGE: 100_000,
  MAX_LENGTH: 10,
} as const;

const RUN_BASE = randomInt(APARTMENT_FIXTURE.MINIMUM_BASE, APARTMENT_FIXTURE.MAXIMUM_BASE);

const APARTMENT_NUMBERS = new Map<string, string>();

export const scopedApartmentNumber = (example: string): string => {
  const context = test.info();
  const key = `${context.testId}:${example}`;
  const existing = APARTMENT_NUMBERS.get(key);
  if (existing) {
    return existing;
  }

  const suffix = example.match(/[א-ת]$/)?.[0] ?? "";
  const leadingZeros = example.match(/^0+/)?.[0] ?? "";
  const sequence =
    RUN_BASE + context.workerIndex * APARTMENT_FIXTURE.WORKER_RANGE + createSequenceNumber();
  const number = `${leadingZeros}${sequence}${suffix}`;
  if (number.length > APARTMENT_FIXTURE.MAX_LENGTH) {
    throw new Error("Apartment test number exceeds the application field length");
  }

  APARTMENT_NUMBERS.set(key, number);
  return number;
};

export const createApartmentNumber = (): string =>
  scopedApartmentNumber(String(createSequenceNumber()));
