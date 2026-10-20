import { join } from "node:path";
import type { ISession } from "../interfaces/entities.interface.ts";
import { LOCAL_STORAGE_KEYS } from "../constants/storage.constant.ts";
import type { UserRoleType } from "../constants/user-role.constant.ts";
import { URLS, AUTOMATION_DIRECTORIES } from "../constants/environment.constant.ts";

export const getAuthStatePath = (role: UserRoleType): string =>
  join(AUTOMATION_DIRECTORIES.AUTH, `${role}.json`);

export const buildAuthState = (session: ISession) => ({
  cookies: [],
  origins: [
    {
      origin: URLS.FRONTEND,
      localStorage: [{ name: LOCAL_STORAGE_KEYS.SESSION, value: JSON.stringify(session) }],
    },
  ],
});

export const buildProjectDraftKey = (userId: string): string =>
  `${LOCAL_STORAGE_KEYS.PROJECT_FORM_DRAFT}:${userId}`;
