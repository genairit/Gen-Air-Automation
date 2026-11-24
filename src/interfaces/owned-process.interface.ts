import type { Server } from "node:net";
import type { ChildProcess } from "node:child_process";

export interface IOwnedBrokerProxy extends Server {
  destroyConnections: () => void;
}
export interface IChildShutdownOptions {
  drainMs?: number;
  forceMs?: number;
}
export interface IReadinessOptions {
  url: string;
  label: string;
  timeoutMs?: number;
  child: ChildProcess;
  signal?: AbortSignal;
  probe?: () => Promise<boolean>;
}
export interface IOwnedCleanup {
  name: string;
  stop: () => Promise<void>;
}

export interface IChildShutdownState {
  forced: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}
