import type { Page } from "@playwright/test";
import { CUSTOMER_PROJECTS_COPY } from "../constants/customer-projects.constant.ts";

export const createCustomerProjectsComponent = (page: Page) => {
  const region = page.getByRole("region", { name: CUSTOMER_PROJECTS_COPY.TITLE });
  const search = region.getByPlaceholder(CUSTOMER_PROJECTS_COPY.SEARCH);
  const more = region.getByRole("button", { name: CUSTOMER_PROJECTS_COPY.MORE, exact: true });
  const retry = region.getByRole("button", { name: CUSTOMER_PROJECTS_COPY.RETRY, exact: true });
  const link = (name: string) => region.getByRole("link").filter({ hasText: name });
  const goto = (customerId: string) => page.goto(`/customers/${customerId}`);
  const tab = (name: string) => region.getByRole("tab", { name: new RegExp(name) });
  return { region, search, more, retry, link, goto, tab };
};
