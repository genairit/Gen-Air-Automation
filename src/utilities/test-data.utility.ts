import { TEST_DATA_FORMATS } from "../constants/test-data.constant.ts";

const runId = Date.now().toString(36);
const sequence = { value: 0 };

export const createSequenceNumber = (): number => {
  sequence.value += 1;

  return sequence.value;
};

export const createUniqueName = (prefix: string): string =>
  `${prefix} ${runId}-${createSequenceNumber()}`;

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
  const body = createRandomDigits(TEST_DATA_FORMATS.COMPANY_NUMBER_BODY_LENGTH);
  const digits = `${TEST_DATA_FORMATS.COMPANY_NUMBER_PREFIX}${body}`;

  return `${digits}${computeCheckDigit(digits)}`;
};

export const createMobilePhone = (): string =>
  `${TEST_DATA_FORMATS.MOBILE_PREFIX}${createRandomDigits(TEST_DATA_FORMATS.MOBILE_SUBSCRIBER_LENGTH)}`;
