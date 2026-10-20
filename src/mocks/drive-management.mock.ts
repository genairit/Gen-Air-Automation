import {
  ROOT_FOLDER_ID,
  MOCK_DRIVE_FILE,
  MOCK_DRIVE_FOLDERS,
  MOCK_NESTED_FOLDER,
} from "./drive.mock.ts";

import type { Page, Route } from "@playwright/test";
import { DRIVE_CONTENT_STATUSES } from "../constants/domain.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../constants/api.constant.ts";
import { HTTP_STATUS, HTTP_METHODS, HTTP_HEADERS } from "../constants/http.constant.ts";

interface IMutation {
  method: string;
  fileId: string;
  folderId?: string | null;
}

const ROOT = ROOT_FOLDER_ID;
const SOURCE = MOCK_DRIVE_FOLDERS.WITH_FILES;
const TARGET = MOCK_DRIVE_FOLDERS.EMPTY;
const NESTED = MOCK_NESTED_FOLDER;

export const MANAGEMENT_FOLDERS = { ROOT, SOURCE, TARGET, NESTED } as const;
export const MANAGEMENT_FILE = {
  ...MOCK_DRIVE_FILE,
  name: "תוכנית מפורטת לתיאום מערכות ואישור ביצוע ".repeat(3).trim() + ".pdf",
};

const parseMoveBody = (body: unknown): { folderId?: string | null } => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Drive move body must be an object");
  }

  if (Object.keys(body).some(key => key !== "folderId")) {
    throw new Error("Unexpected Drive move body properties");
  }

  if (!("folderId" in body)) {
    return {};
  }

  const folderId = body.folderId;
  if (folderId !== null && typeof folderId !== "string") {
    throw new Error("Drive folderId must be a string or null");
  }

  return { folderId };
};

export const mockDriveManagement = async (page: Page, projectId: string) => {
  const files = new Map<string, typeof MANAGEMENT_FILE & { parent: string }>([
    [MANAGEMENT_FILE.id, { ...MANAGEMENT_FILE, parent: NESTED.id }],
  ]);
  const state = {
    failContents: null as string | null,
    mutationStatus: HTTP_STATUS.NO_CONTENT as number,
    holdContents: null as Promise<void> | null,
    holdMutation: null as Promise<void> | null,
  };
  const requests = {
    contents: [] as string[],
    mutations: [] as IMutation[],
    uploads: [] as { folderId: string | null; body: string; contentType: string }[],
  };
  const folders = [
    { ...SOURCE, parent: ROOT },
    { ...TARGET, parent: ROOT },
    { ...NESTED, parent: SOURCE.id },
  ];
  const descendants = (folderId: string): string[] => [
    folderId,
    ...folders
      .filter(folder => folder.parent === folderId)
      .flatMap(folder => descendants(folder.id)),
  ];
  const countFiles = (folderId: string) =>
    [...files.values()].filter(file => descendants(folderId).includes(file.parent)).length;
  await page.route(
    `**${API_PROXY_PREFIX}${API_PATHS.PROJECT_DRIVE}/${projectId}/contents**`,
    async route => {
      const folderId = new URL(route.request().url()).searchParams.get("folderId") ?? ROOT;
      requests.contents.push(folderId);
      if (state.holdContents) {
        await state.holdContents;
      }
      if (state.failContents === folderId) {
        await route.fulfill({
          status: HTTP_STATUS.BAD_GATEWAY,
          json: { message: "provider failure" },
        });
        return;
      }
      await route.fulfill({
        json: {
          folderId,
          files: [...files.values()]
            .filter(file => file.parent === folderId)
            .map(({ parent, ...file }) => file),
          folders: folders
            .filter(folder => folder.parent === folderId)
            .map(({ parent, ...folder }) => ({
              ...folder,
              fileCount: countFiles(folder.id),
              contentStatus: countFiles(folder.id)
                ? DRIVE_CONTENT_STATUSES.HAS_CONTENT
                : DRIVE_CONTENT_STATUSES.EMPTY,
            })),
        },
      });
    },
  );
  const upload = async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    requests.uploads.push({
      folderId: url.searchParams.get("folderId"),
      body: request.postDataBuffer()?.toString() ?? "",
      contentType: request.headers()[HTTP_HEADERS.CONTENT_TYPE] ?? "",
    });
    await state.holdMutation;
    await route.fulfill({ status: HTTP_STATUS.CREATED, json: [] });
  };
  await page.route(
    `**${API_PROXY_PREFIX}${API_PATHS.PROJECT_DRIVE}/${projectId}/files**`,
    async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === HTTP_METHODS.POST) {
        await upload(route);
        return;
      }

      const fileId = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
      const body =
        request.method() === HTTP_METHODS.PATCH ? parseMoveBody(request.postDataJSON()) : {};
      requests.mutations.push({ method: request.method(), fileId, ...body });
      if (state.holdMutation) {
        await state.holdMutation;
      }
      if (state.mutationStatus !== HTTP_STATUS.NO_CONTENT) {
        await route.fulfill({
          status: state.mutationStatus,
          json: { message: "GaxiosError secret-provider-detail" },
        });
        return;
      }
      const file = files.get(fileId);
      if (!file) {
        await route.fulfill({ status: HTTP_STATUS.NOT_FOUND });
        return;
      }
      const handlers: Record<string, () => void> = {
        [HTTP_METHODS.DELETE]: () => {
          files.delete(fileId);
        },
        [HTTP_METHODS.PATCH]: () => {
          file.parent = body.folderId ?? ROOT;
        },
      };
      const mutate = handlers[request.method()];
      if (!mutate) {
        throw new Error(`Unexpected Drive mutation: ${request.method()}`);
      }
      mutate();
      await route.fulfill({ status: HTTP_STATUS.NO_CONTENT });
    },
  );
  return { state, requests, files };
};
