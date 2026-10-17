import type { Page, Route } from "@playwright/test";
import { HTTP_STATUS } from "../constants/http.constant.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../constants/api.constant.ts";
import { MIME_TYPES, DRIVE_CONTENT_STATUSES } from "../constants/domain.constant.ts";

const ROOT_FOLDER_ID = "mock-root-folder";

const FOLDER_ID_PARAM = "folderId";

export const MOCK_DRIVE_FOLDERS = {
  EMPTY: {
    name: "DWG",
    fileCount: 0,
    id: "mock-folder-dwg",
    contentStatus: DRIVE_CONTENT_STATUSES.EMPTY,
  },
  WITH_FILES: {
    name: "PDF",
    fileCount: 1,
    id: "mock-folder-pdf",
    contentStatus: DRIVE_CONTENT_STATUSES.HAS_CONTENT,
  },
} as const;

export const MOCK_DRIVE_FILE = {
  size: 2048,
  isFolder: false,
  id: "mock-file-plan",
  name: "תוכנית קומה.pdf",
  mimeType: MIME_TYPES.PDF,
  modifiedTime: "2026-10-01T10:00:00.000Z",
  webViewLink: "https://drive.google.com/file/d/mock-file-plan/view",
} as const;

const FILES_BY_FOLDER: Record<string, (typeof MOCK_DRIVE_FILE)[]> = {
  [MOCK_DRIVE_FOLDERS.EMPTY.id]: [],
  [MOCK_DRIVE_FOLDERS.WITH_FILES.id]: [MOCK_DRIVE_FILE],
};

const buildDriveRoute = (projectId: string, resource: string) =>
  `**${API_PROXY_PREFIX}${API_PATHS.PROJECT_DRIVE}/${projectId}/${resource}`;

const buildContents = (folderId: string | null) => {
  if (!folderId) {
    return { folderId: ROOT_FOLDER_ID, files: [], folders: Object.values(MOCK_DRIVE_FOLDERS) };
  }

  return { folderId, folders: [], files: FILES_BY_FOLDER[folderId] ?? [] };
};

const answerContents = (route: Route) => {
  const folderId = new URL(route.request().url()).searchParams.get(FOLDER_ID_PARAM);

  return route.fulfill({ status: HTTP_STATUS.OK, json: buildContents(folderId) });
};

export const mockDriveContents = async (page: Page, projectId: string): Promise<void> => {
  await page.route(buildDriveRoute(projectId, "contents**"), answerContents);
};

export const mockDriveUpload = async (page: Page, projectId: string): Promise<string[]> => {
  const uploads: string[] = [];

  await page.route(buildDriveRoute(projectId, "files"), route => {
    uploads.push(route.request().postData() ?? "");

    return route.fulfill({ status: HTTP_STATUS.CREATED, json: [] });
  });

  return uploads;
};
