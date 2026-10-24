import type { Page } from "@playwright/test";
import { findTab } from "./tab.component.ts";
import { findFieldByTitle } from "./field.component.ts";
import { findMainContent } from "./layout.component.ts";
import { APARTMENT_COPY } from "../constants/copy.constant.ts";
import { buildApartmentRoute } from "../utilities/route.utility.ts";
import type { IApartmentFormInput } from "../interfaces/apartment.interface.ts";
import { APARTMENT_DESIGN_COPY } from "../constants/apartment-design.constant.ts";

export const createApartmentFormPage = (page: Page) => {
  const form = findMainContent(page);
  const submitButton = form.getByRole("button", { name: APARTMENT_COPY.ADD, exact: true });

  const fill = async (input: IApartmentFormInput) => {
    await findFieldByTitle(form, APARTMENT_COPY.FLOOR).fill(input.floor);
    await findFieldByTitle(form, APARTMENT_COPY.NUMBER).fill(input.number);
    await form.getByPlaceholder(APARTMENT_DESIGN_COPY.CUSTOMER_SEARCH).fill(input.customerName);
    await form.getByRole("option").filter({ hasText: input.customerName }).click();
  };

  return { submitButton, fill };
};

export const createApartmentPage = (page: Page) => {
  const nextButton = page.getByRole("button", { name: APARTMENT_COPY.NEXT });
  const notesInput = page.getByPlaceholder(APARTMENT_COPY.NOTES_PLACEHOLDER);
  const saveNotesButton = page.getByRole("button", { name: APARTMENT_COPY.SAVE_NOTES });

  const goto = (buildingId: string, apartmentId: string) =>
    page.goto(buildApartmentRoute(buildingId, apartmentId));

  const stageTab = (statusName: string) => findTab(page, statusName);

  return { notesInput, nextButton, saveNotesButton, goto, stageTab };
};
