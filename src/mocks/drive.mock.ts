import type { Page, Route } from "@playwright/test";
import { HTTP_STATUS } from "../constants/http.constant.ts";
import type { IProject } from "../interfaces/entities.interface.ts";
import { API_PATHS, API_PROXY_PREFIX } from "../constants/api.constant.ts";
import { MIME_TYPES, DRIVE_CONTENT_STATUSES } from "../constants/domain.constant.ts";

export const ROOT_FOLDER_ID = "mock-root-folder";

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

export const MOCK_NESTED_FOLDER = {
  fileCount: 1,
  id: "mock-nested-folder",
  name: "תוכניות מפורטות לתיאום מערכות ואישור ביצוע ".repeat(4).trim(),
  contentStatus: DRIVE_CONTENT_STATUSES.HAS_CONTENT,
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

  return {
    folderId,
    folders: folderId === MOCK_DRIVE_FOLDERS.WITH_FILES.id ? [MOCK_NESTED_FOLDER] : [],
    files:
      folderId === MOCK_NESTED_FOLDER.id ? [MOCK_DRIVE_FILE] : (FILES_BY_FOLDER[folderId] ?? []),
  };
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

export const mockMissingDrive = async (page: Page, project: IProject) => {
  const projectId = project.id;
  const requests = { contents: 0, provisions: [] as string[] };
  const state = { recovered: false };

  await page.route(buildDriveRoute(projectId, "contents**"), route => {
    requests.contents += 1;
    if (state.recovered) {
      return answerContents(route);
    }

    return route.fulfill({
      status: HTTP_STATUS.CONFLICT,
      json: { message: `Missing root for project ${projectId}` },
    });
  });
  await page.route(buildDriveRoute(projectId, "provision"), route => {
    requests.provisions.push(route.request().method());
    return route.fulfill({
      status: HTTP_STATUS.CREATED,
      json: { ...project, driveFolderId: ROOT_FOLDER_ID },
    });
  });

  return { requests, state, provisionRoute: buildDriveRoute(projectId, "provision") };
};
