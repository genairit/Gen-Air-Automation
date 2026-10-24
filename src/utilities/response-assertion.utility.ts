import { expect, type APIResponse } from "@playwright/test";
import { HTTP_STATUS } from "../constants/http.constant.ts";

export const expectResponseStatus = async (response: APIResponse, status: number) =>
  expect(response.status(), await response.text()).toBe(status);

export const expectResponseOk = async (response: APIResponse) =>
  expect(response.ok(), await response.text()).toBe(true);

export const expectBadRequest = (response: APIResponse) =>
  expectResponseStatus(response, HTTP_STATUS.BAD_REQUEST);

export const expectForbidden = (response: APIResponse) =>
  expectResponseStatus(response, HTTP_STATUS.FORBIDDEN);

export const expectNotFound = (response: APIResponse) =>
  expectResponseStatus(response, HTTP_STATUS.NOT_FOUND);
