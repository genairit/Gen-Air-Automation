import type { Page } from "@playwright/test";
import { selectOption } from "./select.component.ts";
import { PAYMENT_DEFAULT_COPY } from "../constants/payment-default.constant.ts";

export const createCustomerPaymentDefaultPage = (page: Page) => {
  const field = (title: string) => page.getByRole("combobox", { name: title, exact: true });
  const choose = (title: string, label: string) => selectOption(page, field(title), label);
  const saveButton = page.getByRole("button", { name: PAYMENT_DEFAULT_COPY.SAVE, exact: true });

  return { field, choose, saveButton };
};
