import { pathToFileURL } from "node:url";

export const buildNodePreloadOptions = (path: string): string =>
  `--import=${pathToFileURL(path).href}`;
