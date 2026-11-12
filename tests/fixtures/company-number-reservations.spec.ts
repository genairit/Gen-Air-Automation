import { resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { test, expect } from "@playwright/test";

const execute = promisify(execFile);
const SAMPLE_SIZE = 1500;
const CONCURRENT_PROCESSES = 4;
const utilityUrl = pathToFileURL(resolve("src/utilities/test-data.utility.ts")).href;

const validCompanyNumber = (value: string): boolean =>
  /^51\d{7}$/.test(value) &&
  [...value].reduce((total, digit, index) => {
    const weighted = Number(digit) * (index % 2 === 1 ? 2 : 1);
    return total + (weighted > 9 ? weighted - 9 : weighted);
  }, 0) %
    10 ===
    0;

test("company fixtures remain unique across concurrent processes and a restarted worker", async ({}, testInfo) => {
  const artifacts = testInfo.outputPath("fixture-processes");
  const generate = async (): Promise<string[]> => {
    const { stdout } = await execute(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { createCompanyNumber } from ${JSON.stringify(utilityUrl)};
       process.stdout.write(JSON.stringify(Array.from({ length: ${SAMPLE_SIZE} }, createCompanyNumber)));`,
      ],
      {
        env: { ...process.env, GEN_AIR_ARTIFACTS_DIR: artifacts },
      },
    );
    return JSON.parse(stdout);
  };
  const simultaneous = await Promise.all(Array.from({ length: CONCURRENT_PROCESSES }, generate));
  const restarted = await generate();
  const numbers = [...simultaneous.flat(), ...restarted];

  expect(numbers).toHaveLength(SAMPLE_SIZE * (CONCURRENT_PROCESSES + 1));
  expect(new Set(numbers).size).toBe(numbers.length);
  expect(numbers.every(validCompanyNumber)).toBe(true);
});
