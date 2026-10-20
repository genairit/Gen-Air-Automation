export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  CONFLICT: 409,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

export const HTTP_METHODS = {
  POST: "POST",
  PATCH: "PATCH",
  DELETE: "DELETE",
} as const;

export type HttpMethodType = (typeof HTTP_METHODS)[keyof typeof HTTP_METHODS];

export const HTTP_HEADERS = {
  CONTENT_TYPE: "content-type",
} as const;

export const CONTENT_TYPES = {
  HTML: "text/html",
} as const;

export const HTTP_PROTOCOLS = {
  SECURE: "https:",
} as const;
