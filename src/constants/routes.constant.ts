export const ROUTES = {
  BOARD: "/",
  TASKS: "/tasks",
  LOGIN: "/login",
  PROJECTS: "/projects",
  SETTINGS: "/settings",
  NEW_TASK: "/tasks/new",
  EMPLOYEES: "/employees",
  CUSTOMERS: "/customers",
  NEW_PROJECT: "/projects/new",
  NEW_CUSTOMER: "/customers/new",
} as const;

export const ROUTE_SEGMENTS = {
  EDIT: "edit",
  APARTMENTS: "apartments",
} as const;

export const UUID_PATTERN = "[0-9a-f-]{36}";
