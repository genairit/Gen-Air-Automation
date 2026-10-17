import { ROUTES, ROUTE_SEGMENTS } from "../constants/routes.constant.ts";

const joinPath = (...segments: string[]) => segments.join("/");

export const buildCustomerRoute = (customerId: string): string =>
  joinPath(ROUTES.CUSTOMERS, customerId);

export const buildProjectRoute = (projectId: string): string =>
  joinPath(ROUTES.PROJECTS, projectId);

export const buildTaskRoute = (taskId: string): string => joinPath(ROUTES.TASKS, taskId);

export const buildEditProjectRoute = (projectId: string): string =>
  joinPath(buildProjectRoute(projectId), ROUTE_SEGMENTS.EDIT);

export const toEndAnchoredPattern = (path: string): RegExp => new RegExp(`${path}$`);

export const buildApartmentRoute = (buildingId: string, apartmentId: string): string =>
  joinPath(buildProjectRoute(buildingId), ROUTE_SEGMENTS.APARTMENTS, apartmentId);
