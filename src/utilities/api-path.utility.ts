import { API_PATHS, API_SEGMENTS, API_PROXY_PREFIX } from "../constants/api.constant.ts";

type TTaskActionSegment = (typeof API_SEGMENTS)["CLAIM" | "STATUS" | "URGENCY"];

export const buildUserPath = (userId: string): string => `${API_PATHS.USER}/${userId}`;

export const buildBrowserApiPath = (path: string): string => `${API_PROXY_PREFIX}${path}`;

export const buildBrowserApiPattern = (path: string): string => `**${buildBrowserApiPath(path)}`;

export const buildCustomerPath = (customerId: string): string =>
  `${API_PATHS.CUSTOMER}/${customerId}`;

export const buildQuotationPath = (quotationId: string): string =>
  `${API_PATHS.QUOTATION}/${quotationId}`;

export const buildTaskPath = (taskId: string): string => `${API_PATHS.TASK}/${taskId}`;

export const buildTaskActionPath = (taskId: string, segment: TTaskActionSegment): string =>
  `${buildTaskPath(taskId)}/${segment}`;

export const buildProjectPath = (projectId: string): string => `${API_PATHS.PROJECT}/${projectId}`;

export const buildProjectStagePath = (projectId: string): string =>
  `${buildProjectPath(projectId)}/${API_SEGMENTS.STAGE}`;

export const buildProjectMembersPath = (projectId: string): string =>
  `${API_PATHS.PROJECT_MEMBERS}/${projectId}`;

export const buildApartmentsPath = (buildingId: string): string =>
  `${buildProjectPath(buildingId)}/${API_SEGMENTS.APARTMENTS}`;
