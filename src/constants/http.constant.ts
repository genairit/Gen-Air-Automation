export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const HTTP_METHODS = {
  POST: "POST",
  PATCH: "PATCH",
} as const;

export const HTTP_HEADERS = {
  CONTENT_TYPE: "content-type",
} as const;

export const CONTENT_TYPES = {
  HTML: "text/html",
} as const;

export const HTTP_PROTOCOLS = {
  SECURE: "https:",
} as const;
