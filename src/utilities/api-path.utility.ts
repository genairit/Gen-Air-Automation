import { API_PATHS, API_SEGMENTS } from "../constants/api.constant.ts";

type TTaskActionSegment = (typeof API_SEGMENTS)["CLAIM" | "STATUS" | "URGENCY"];

export const buildCustomerPath = (customerId: string): string =>
  `${API_PATHS.CUSTOMER}/${customerId}`;

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
