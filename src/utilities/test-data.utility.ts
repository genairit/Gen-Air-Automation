import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { randomInt } from "node:crypto";
import { TEST_DATA_FORMATS } from "../constants/test-data.constant.ts";
import { AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";

const runId = Date.now().toString(36);
const sequence = { value: 0 };

export const createSequenceNumber = (): number => {
  sequence.value += 1;

  return sequence.value;
};

export const createUniqueName = (prefix: string): string =>
  `${prefix} ${runId}-${createSequenceNumber()}`;

export const createUniquePassword = (): string => `AutomationQA${runId}${createSequenceNumber()}!`;

export const buildTestEmail = (localPart: string): string =>
  `${localPart}@${TEST_DATA_FORMATS.EMAIL_DOMAIN}`;

export const createUniqueEmail = (prefix: string): string =>
  buildTestEmail(`${prefix}.${runId}.${createSequenceNumber()}`);

const toCheckDigitContribution = (digit: number, index: number) => {
  const isDoubledPosition = index % 2 === 1;
  const weighted = isDoubledPosition ? digit * TEST_DATA_FORMATS.DOUBLED_DIGIT_WEIGHT : digit;
  const isTwoDigitProduct = weighted > TEST_DATA_FORMATS.MAX_SINGLE_DIGIT;

  return isTwoDigitProduct ? weighted - TEST_DATA_FORMATS.MAX_SINGLE_DIGIT : weighted;
};

const computeCheckDigit = (digits: string) => {
  const checksum = [...digits]
    .map(Number)
    .reduce((sum, digit, index) => sum + toCheckDigitContribution(digit, index), 0);
  const remainder = checksum % TEST_DATA_FORMATS.DECIMAL_BASE;

  return (TEST_DATA_FORMATS.DECIMAL_BASE - remainder) % TEST_DATA_FORMATS.DECIMAL_BASE;
};

const createRandomDigits = (length: number) =>
  Array.from({ length }, () => Math.floor(Math.random() * TEST_DATA_FORMATS.DECIMAL_BASE)).join("");

export const createCompanyNumber = (): string => {
  // Atomic reservations survive Playwright worker restarts.
  const directory = resolve(AUTOMATION_DIRECTORIES.FIXTURES, "company-numbers");
  mkdirSync(directory, { recursive: true });
  const capacity = TEST_DATA_FORMATS.DECIMAL_BASE ** TEST_DATA_FORMATS.COMPANY_NUMBER_BODY_LENGTH;
  const initial = randomInt(capacity);
  const body = (() => {
    const cursor = { offset: 0 };
    while (cursor.offset < capacity) {
      const offset = cursor.offset;
      cursor.offset += 1;
      const candidate = String((initial + offset) % capacity).padStart(
        TEST_DATA_FORMATS.COMPANY_NUMBER_BODY_LENGTH,
        "0",
      );
      try {
        mkdirSync(resolve(directory, candidate));
        return candidate;
      } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") {
          throw error;
        }
      }
    }
    throw new Error("The disposable test database exhausted its company-number fixture pool");
  })();
  const digits = `${TEST_DATA_FORMATS.COMPANY_NUMBER_PREFIX}${body}`;

  return `${digits}${computeCheckDigit(digits)}`;
};

export const createMobilePhone = (): string =>
  `${TEST_DATA_FORMATS.MOBILE_PREFIX}${createRandomDigits(TEST_DATA_FORMATS.MOBILE_SUBSCRIBER_LENGTH)}`;
