export const API_PROXY_PREFIX = "/api";

export const API_SEGMENTS = {
  APARTMENTS: "apartments",
} as const;

export const API_PATHS = {
  USER: "/user",
  TASK: "/task",
  PROJECT: "/project",
  LOGIN: "/auth/login",
  CUSTOMER: "/customer",
  PROJECT_TYPE: "/project-type",
  PROJECT_DRIVE: "/project-drive",
  PROJECT_STAGE: "/project-stage",
  USER_ROLE_COUNTS: "/user/role-counts",
  MY_TASK_COUNTS: "/task/my-tasks/counts",
  PROJECT_STAGE_COUNTS: "/project/stage-counts",
  CUSTOMER_SYNC_COUNTS: "/customer/sync-status-counts",
} as const;
