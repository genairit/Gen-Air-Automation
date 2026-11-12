import type { Page } from "@playwright/test";
import { escapeRegex } from "../utilities/regex.utility.ts";
import { CUSTOMER_PROJECTS_COPY } from "../constants/customer-projects.constant.ts";

export const createCustomerProjectsComponent = (page: Page) => {
  const region = page.getByRole("region", { name: CUSTOMER_PROJECTS_COPY.TITLE });
  const search = region.getByPlaceholder(CUSTOMER_PROJECTS_COPY.SEARCH);
  const more = region.getByRole("button", { name: CUSTOMER_PROJECTS_COPY.MORE, exact: true });
  const retry = region.getByRole("button", { name: CUSTOMER_PROJECTS_COPY.RETRY, exact: true });
  const link = (name: string) => region.getByRole("link").filter({ hasText: name });
  const goto = (customerId: string) => page.goto(`/customers/${customerId}`);
  const statusFilter = (name: string) =>
    region.getByRole("button", { name: new RegExp(`^${escapeRegex(name)}(?:\\s|$)`) });
  return { region, search, more, retry, link, goto, statusFilter };
};
