import {
  CUSTOMER_PAYMENT_COPY,
  UNRELATED_PAYMENT_FIELD_ERRORS,
} from "../constants/customer-payment-schedule.constant.ts";

import { expect, type Page } from "@playwright/test";
import { PAYMENT_DEFAULT_COPY } from "../constants/payment-default.constant.ts";
import type { IPaymentStage } from "../interfaces/payment-configuration.interface.ts";

export const createCustomerPaymentDefaultPage = (page: Page) => {
  const choice = (label: string) => page.getByRole("radio", { name: label, exact: true });
  const choose = (label: string) => choice(label).click();
  const defaultMenu = page.getByRole("combobox", { name: PAYMENT_DEFAULT_COPY.EDIT, exact: true });
  const defaultOption = (label: string) => page.getByRole("option", { name: label, exact: true });
  const chooseDefault = async (label: string) => {
    await defaultMenu.click();
    await defaultOption(label).click();
  };
  const percent = (index = 0) =>
    page.getByRole("spinbutton", { name: CUSTOMER_PAYMENT_COPY.PERCENT, exact: true }).nth(index);
  const milestone = (index = 0) =>
    page.getByRole("textbox", { name: CUSTOMER_PAYMENT_COPY.MILESTONE, exact: true }).nth(index);
  const addButton = page.getByRole("button", {
    name: CUSTOMER_PAYMENT_COPY.ADD_STAGE,
    exact: true,
  });
  const removeButton = (index: number) =>
    page.getByRole("button", {
      name: `${CUSTOMER_PAYMENT_COPY.REMOVE} ${index + 1}`,
      exact: true,
    });
  const fillSchedule = async (stages: readonly IPaymentStage[]) => {
    for (const [index, stage] of stages.entries()) {
      if ((await percent(index).count()) === 0) {
        await addButton.click();
      }

      await percent(index).fill(stage.percent);
      await milestone(index).fill(stage.text);
    }
  };
  const saveButton = page.getByRole("button", { name: PAYMENT_DEFAULT_COPY.SAVE, exact: true });
  const expectValidFields = async (): Promise<void> => {
    for (const message of Object.values(UNRELATED_PAYMENT_FIELD_ERRORS)) {
      await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    }
  };

  return {
    choice,
    choose,
    defaultMenu,
    defaultOption,
    chooseDefault,
    percent,
    milestone,
    addButton,
    removeButton,
    fillSchedule,
    saveButton,
    expectValidFields,
  };
};
