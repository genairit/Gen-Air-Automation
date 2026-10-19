import { API_PATHS, API_SEGMENTS } from "../constants/api.constant.ts";

export const buildCustomerPath = (customerId: string): string =>
  `${API_PATHS.CUSTOMER}/${customerId}`;

export const buildTaskPath = (taskId: string): string => `${API_PATHS.TASK}/${taskId}`;

export const buildApartmentsPath = (buildingId: string): string =>
  `${API_PATHS.PROJECT}/${buildingId}/${API_SEGMENTS.APARTMENTS}`;
