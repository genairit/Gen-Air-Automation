export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  INTERNAL_SERVER_ERROR: 500,
  NOT_FOUND: 404,
} as const;

export const HTTP_METHODS = {
  POST: "POST",
  PATCH: "PATCH",
} as const;
