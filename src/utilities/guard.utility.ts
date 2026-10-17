export type TGuard<T> = (value: unknown) => value is T;

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createStringFieldsGuard =
  <T>(fields: readonly (keyof T & string)[]): TGuard<T> =>
  (value: unknown): value is T =>
    isRecord(value) && fields.every(field => typeof value[field] === "string");

export const createArrayGuard =
  <T>(isItem: TGuard<T>): TGuard<T[]> =>
  (value: unknown): value is T[] =>
    Array.isArray(value) && value.every(isItem);

export const isNumberRecord = (value: unknown): value is Record<string, number> =>
  isRecord(value) && Object.values(value).every(entry => typeof entry === "number");

export const createNestedNumberRecordGuard =
  <T>(field: keyof T & string): TGuard<T> =>
  (value: unknown): value is T =>
    isRecord(value) && isNumberRecord(value[field]);
