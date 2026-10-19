import type { Page } from "@playwright/test";
import { findFieldByTitle } from "./field.component.ts";
import { findMainContent } from "./layout.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { PROJECT_FORM_COPY } from "../constants/copy.constant.ts";
import type { IFakePlace } from "../interfaces/fake-place.interface.ts";

export interface IProjectFormInput {
  name: string;
  place: IFakePlace;
  contactName: string;
  contactRole: string;
  contactPhone: string;
  customerName: string;
  projectTypeName: string;
  paymentTermsLabel: string;
}

type TContactInput = Pick<IProjectFormInput, "contactName" | "contactRole" | "contactPhone">;

export const createProjectFormPage = (page: Page) => {
  const form = findMainContent(page);
  const nameInput = findFieldByTitle(form, PROJECT_FORM_COPY.NAME);
  const addressVerified = page.getByText(PROJECT_FORM_COPY.ADDRESS_VERIFIED);
  const contactNameInput = form.getByPlaceholder(PROJECT_FORM_COPY.CONTACT_NAME_PLACEHOLDER);
  const contactPhoneInput = form.getByPlaceholder(PROJECT_FORM_COPY.CONTACT_PHONE_PLACEHOLDER);
  const saveButton = page.getByRole("button", { name: PROJECT_FORM_COPY.SAVE });
  const createButton = page.getByRole("button", { name: PROJECT_FORM_COPY.CREATE });
  const deleteButton = page.getByRole("button", { name: PROJECT_FORM_COPY.DELETE });
  const addressInput = form.getByRole("combobox", { name: PROJECT_FORM_COPY.ADDRESS });
  const customerSearch = form.getByPlaceholder(PROJECT_FORM_COPY.CUSTOMER_SEARCH_PLACEHOLDER);

  const goto = () => page.goto(ROUTES.NEW_PROJECT);

  const chooseProjectType = (projectTypeName: string) =>
    form.getByText(projectTypeName, { exact: true }).click();

  const chooseAddress = async (place: IFakePlace) => {
    await addressInput.fill(place.mainText);
    await page.getByRole("option").filter({ hasText: place.mainText }).click();
  };

  const chooseCustomer = async (customerName: string) => {
    await customerSearch.fill(customerName);
    await form.getByRole("option").filter({ hasText: customerName }).click();
  };

  const fillContact = async (input: TContactInput) => {
    await form.getByPlaceholder(PROJECT_FORM_COPY.CONTACT_NAME_PLACEHOLDER).fill(input.contactName);
    await form
      .getByPlaceholder(PROJECT_FORM_COPY.CONTACT_PHONE_PLACEHOLDER)
      .fill(input.contactPhone);
    await form.getByRole("button", { name: input.contactRole, exact: true }).click();
  };

  const fill = async (input: IProjectFormInput) => {
    await nameInput.fill(input.name);
    await chooseProjectType(input.projectTypeName);
    await chooseAddress(input.place);
    await fillContact(input);
    await chooseCustomer(input.customerName);
    await form.getByRole("radio", { name: input.paymentTermsLabel }).check();
  };

  return {
    nameInput,
    contactNameInput,
    contactPhoneInput,
    addressInput,
    customerSearch,
    saveButton,
    createButton,
    deleteButton,
    addressVerified,
    goto,
    fill,
  };
};
