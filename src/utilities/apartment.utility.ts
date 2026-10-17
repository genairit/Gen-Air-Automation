import type { IApartmentFormInput } from "../interfaces/apartment.interface.ts";
import { APARTMENT_COPY, PROJECT_PAGE_COPY } from "../constants/copy.constant.ts";

type TApartmentLabelInput = Pick<IApartmentFormInput, "floor" | "number">;

export const formatApartmentName = (apartmentNumber: string): string =>
  `${APARTMENT_COPY.APARTMENT} ${apartmentNumber}`;

export const formatApartmentHeading = (input: TApartmentLabelInput): string =>
  `${formatApartmentName(input.number)} · ${APARTMENT_COPY.FLOOR} ${input.floor}`;

export const formatBuildingLink = (buildingName: string): string =>
  `${APARTMENT_COPY.BUILDING_PREFIX} ${buildingName}`;

export const formatStageLabel = (statusName: string): string =>
  `${PROJECT_PAGE_COPY.STAGE_PREFIX} ${statusName}`;
