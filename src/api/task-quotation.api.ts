import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import type { TGenAirApi } from "./gen-air-api.ts";
import { TASK_TYPES } from "../constants/domain.constant.ts";
import { HTTP_METHODS } from "../constants/http.constant.ts";
import { seedCustomer, seedStandaloneProject } from "./seed-data.ts";

export interface ITaskQuotationResult {
  created: boolean;
  quotationId: string;
}
export interface ITaskQuotationScenario {
  task: import("../interfaces/entities.interface.ts").ITask;
  project: import("../interfaces/entities.interface.ts").IProject;
  customer: import("../interfaces/entities.interface.ts").ICustomer;
}
export const taskQuotationPath = (id: string): string => `/task/${id}/quotation`;
export const createTaskQuotation = async (
  api: TGenAirApi,
  id: string,
): Promise<ITaskQuotationResult> => {
  const response = await api.send(HTTP_METHODS.POST, taskQuotationPath(id), {});
  expect(response.status()).toBe(200);
  const result: ITaskQuotationResult = await response.json();
  expect(result.quotationId).toMatch(/^[0-9a-f-]{36}$/i);
  expect(typeof result.created).toBe("boolean");
  return result;
};

export const seedTaskQuotationScenario = async (
  api: TGenAirApi,
): Promise<ITaskQuotationScenario> => {
  const customer = await seedCustomer(api);
  const project = await seedStandaloneProject(api, customer);
  const task = await api.createTask({
    projectId: project.id,
    taskType: TASK_TYPES.QUOTATION,
    title: `הצעה ${randomUUID()}`,
    description: "QA",
  });
  return { customer, project, task };
};
