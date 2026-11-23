import type { Page } from "@playwright/test";
import { PAYMENT_DEFAULT_COPY } from "../constants/payment-default.constant.ts";
import type { IPaymentStage } from "../interfaces/payment-configuration.interface.ts";
import { CUSTOMER_PAYMENT_COPY } from "../constants/customer-payment-schedule.constant.ts";

export const createCustomerPaymentDefaultPage = (page: Page) => {
  const choice = (label: string) => page.getByRole("radio", { name: label, exact: true });
  const choose = (label: string) => choice(label).click();
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
    await choose(CUSTOMER_PAYMENT_COPY.CUSTOM);
    for (const [index, stage] of stages.entries()) {
      if ((await percent(index).count()) === 0) {
        await addButton.click();
      }

      await percent(index).fill(stage.percent);
      await milestone(index).fill(stage.text);
    }
  };
  const saveButton = page.getByRole("button", { name: PAYMENT_DEFAULT_COPY.SAVE, exact: true });

  return { choice, choose, percent, milestone, addButton, removeButton, fillSchedule, saveButton };
};
