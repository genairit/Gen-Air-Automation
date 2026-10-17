import {
  buildTaskRoute,
  buildProjectRoute,
  buildCustomerRoute,
  buildApartmentRoute,
  toEndAnchoredPattern,
} from "../utilities/route.utility.ts";

import { UUID_PATTERN } from "./routes.constant.ts";

export const ROUTE_PATTERNS = {
  TASK: toEndAnchoredPattern(buildTaskRoute(UUID_PATTERN)),
  PROJECT: toEndAnchoredPattern(buildProjectRoute(UUID_PATTERN)),
  CUSTOMER: toEndAnchoredPattern(buildCustomerRoute(UUID_PATTERN)),
  APARTMENT: toEndAnchoredPattern(buildApartmentRoute(UUID_PATTERN, UUID_PATTERN)),
} as const;
