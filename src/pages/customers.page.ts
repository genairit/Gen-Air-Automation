import {
  CUSTOMERS_COPY,
  CUSTOMER_FORM_COPY,
  CUSTOMER_FIELD_NAMES,
  type CustomerFieldType,
} from "../constants/copy.constant.ts";

import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import type { TCustomerFormInput } from "../interfaces/customer-form.interface.ts";

export const createCustomersPage = (page: Page) => {
  const searchBox = page.getByPlaceholder(CUSTOMERS_COPY.SEARCH_PLACEHOLDER);
  const newCustomerButton = page.getByRole("button", { name: CUSTOMERS_COPY.NEW_CUSTOMER });
  const pendingTab = findCountedTab(page, CUSTOMERS_COPY.PENDING_TAB);

  const goto = () => page.goto(ROUTES.CUSTOMERS);

  const findRow = (text: string) => findTableRow(page, text);

  return { searchBox, pendingTab, newCustomerButton, goto, findRow };
};

export const createCustomerFormPage = (page: Page) => {
  const invalidMessage = page.getByText(CUSTOMER_FORM_COPY.INVALID);
  const saveButton = page.getByRole("button", { name: CUSTOMER_FORM_COPY.SAVE });

  const goto = () => page.goto(ROUTES.NEW_CUSTOMER);

  const field = (name: CustomerFieldType) =>
    page.getByRole("textbox", { name: CUSTOMER_FORM_COPY.FIELDS[name], exact: true });

  const fill = async (input: TCustomerFormInput) => {
    for (const name of CUSTOMER_FIELD_NAMES) {
      await field(name).fill(input[name]);
    }
  };

  return { saveButton, invalidMessage, goto, fill, field };
};
