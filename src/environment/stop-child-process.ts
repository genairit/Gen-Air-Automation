import type {
  IChildShutdownState,
  IChildShutdownOptions,
} from "../interfaces/owned-process.interface.ts";

import type { ChildProcess } from "node:child_process";
import { TIME_UNITS } from "../constants/time.constant.ts";

const SHUTDOWN = {
  DRAIN_MS: 160 * TIME_UNITS.SECOND_MS,
  FORCE_MS: 10 * TIME_UNITS.SECOND_MS,
} as const;
const hasExited = (child: ChildProcess): boolean =>
  child.exitCode !== null || child.signalCode !== null;
export const stopChildProcess = async (
  child: ChildProcess | null,
  options: IChildShutdownOptions = {},
): Promise<void> => {
  if (child === null) {
    return;
  }

  if (hasExited(child)) {
    return;
  }

  await new Promise<void>((resolve, reject): void => {
    const state: IChildShutdownState = { forced: false, timer: null };
    const settle = (): void => {
      if (state.timer !== null) {
        clearTimeout(state.timer);
      }
      child.removeListener("exit", settle);
      if (state.forced) {
        reject(new Error("Test application exceeded its shutdown drain; forced exit observed"));
        return;
      }

      resolve();
    };
    child.once("exit", settle);
    state.timer = setTimeout((): void => {
      state.forced = true;
      state.timer = setTimeout((): void => {
        child.removeListener("exit", settle);
        reject(new Error("Owned child did not exit after SIGKILL"));
      }, options.forceMs ?? SHUTDOWN.FORCE_MS);
      child.kill("SIGKILL");
    }, options.drainMs ?? SHUTDOWN.DRAIN_MS);
    child.kill("SIGTERM");
  });
};

export const stopChildProcesses = async (children: (ChildProcess | null)[]): Promise<void> => {
  const results = await Promise.allSettled(
    children.map((child): Promise<void> => stopChildProcess(child)),
  );
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === "rejected")
    .map((result): unknown => result.reason);
  if (failures.length > 0) {
    throw new AggregateError(failures, "Owned child shutdown failed");
  }
};
