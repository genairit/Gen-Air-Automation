import type { APIResponse, Page, Request, Route } from "@playwright/test";

export interface IDirectorySearchMonitor {
  queries: string[];
  dispose: () => void;
}

export interface IDelayedDirectorySearch {
  release: () => void;
  started: Promise<void>;
  finished: Promise<void>;
  isAborted: () => boolean;
  dispose: () => Promise<void>;
}

export interface IDelayedDirectorySearchOptions {
  page: Page;
  query: string;
}

export interface IDelayedDirectoryResponseOptions extends IDelayedDirectorySearchOptions {
  reply: (route: Route, response: APIResponse) => Promise<void>;
}

export interface IDirectoryRequestState {
  request: Request | null;
}
