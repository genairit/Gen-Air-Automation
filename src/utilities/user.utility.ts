import type { IUser } from "../interfaces/entities.interface.ts";

export const formatFullName = (user: Pick<IUser, "firstName" | "lastName">): string =>
  `${user.firstName} ${user.lastName}`;
