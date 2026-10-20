import {
  CUSTOMERS_COPY,
  CUSTOMER_FORM_COPY,
  CUSTOMER_FIELD_NAMES,
  type CustomerFieldType,
} from "../constants/copy.constant.ts";

import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { selectOption } from "./select.component.ts";
import { findCardByTitle } from "./card.component.ts";
import { findMainContent } from "./layout.component.ts";
import { ROUTES } from "../constants/routes.constant.ts";
import { findFieldContainer } from "./field.component.ts";
import type { TCustomerFormInput } from "../interfaces/customer-form.interface.ts";

const PARENT_XPATH = "xpath=..";

const ADD_ICON_TEST_ID = "AddRoundedIcon";

export const createCustomersPage = (page: Page) => {
  const main = findMainContent(page);
  const heading = main.getByRole("heading", { level: 1 });
  const managersOnlyCaption = main.getByText(CUSTOMERS_COPY.MANAGERS_ONLY, { exact: true });
  const searchBox = page.getByPlaceholder(CUSTOMERS_COPY.SEARCH_PLACEHOLDER);
  const pendingTab = findCountedTab(page, CUSTOMERS_COPY.PENDING_TAB);
  const newCustomerButton = page.getByRole("button", {
    exact: true,
    name: CUSTOMERS_COPY.NEW_CUSTOMER,
  });
  const newCustomerIcon = newCustomerButton.getByTestId(ADD_ICON_TEST_ID);
  const nextPageButton = main.getByRole("button", { name: CUSTOMERS_COPY.NEXT_PAGE, exact: true });
  const pagination = main.getByRole("navigation").filter({ has: nextPageButton });

  const goto = () => page.goto(ROUTES.CUSTOMERS);

  const findRow = (text: string) => findTableRow(page, text);

  const readLastPageNumber = async () => {
    const labels = await pagination.getByRole("button").allInnerTexts();
    const pageNumbers = labels.map(Number).filter(Number.isInteger);

    return Math.max(...pageNumbers);
  };

  return {
    main,
    heading,
    searchBox,
    pendingTab,
    pagination,
    nextPageButton,
    newCustomerIcon,
    newCustomerButton,
    managersOnlyCaption,
    goto,
    findRow,
    readLastPageNumber,
  };
};

export const createCustomerFormPage = (page: Page) => {
  const main = findMainContent(page);
  const errorBanner = main.getByRole("alert");
  const heading = main.getByRole("heading", { level: 1, name: CUSTOMER_FORM_COPY.TITLE });
  const headerText = heading.locator(PARENT_XPATH);
  const eyebrow = headerText.getByText(CUSTOMER_FORM_COPY.EYEBROW, { exact: true });
  const requiredErrors = main.getByText(CUSTOMER_FORM_COPY.REQUIRED, { exact: true });
  const identityCard = findCardByTitle(main, CUSTOMER_FORM_COPY.IDENTITY);
  const contactCard = findCardByTitle(main, CUSTOMER_FORM_COPY.CONTACT);
  const summaryCard = findCardByTitle(main, CUSTOMER_FORM_COPY.SUMMARY);
  const typeField = findFieldContainer(identityCard, CUSTOMER_FORM_COPY.TYPE);
  const typeSelector = typeField.getByRole("combobox");
  const saveButton = main.getByRole("button", { name: CUSTOMER_FORM_COPY.SAVE, exact: true });
  const cancelButton = main.getByRole("button", { name: CUSTOMER_FORM_COPY.CANCEL, exact: true });
  const actionButtons = saveButton.locator(PARENT_XPATH).getByRole("button");
  const deniedTitle = main.getByText(CUSTOMERS_COPY.CREATE_DENIED, { exact: true });
  const backToCustomersButton = main.getByRole("button", {
    exact: true,
    name: CUSTOMERS_COPY.BACK_TO_CUSTOMERS,
  });

  const goto = () => page.goto(ROUTES.NEW_CUSTOMER);

  const field = (name: CustomerFieldType) =>
    main.getByRole("textbox", { name: CUSTOMER_FORM_COPY.FIELDS[name], exact: true });

  const findFieldHint = (name: CustomerFieldType, hint: string) =>
    findFieldContainer(main, CUSTOMER_FORM_COPY.FIELDS[name]).getByText(hint, { exact: true });

  const findSummaryTile = (label: string) =>
    summaryCard.getByText(label, { exact: true }).locator(PARENT_XPATH);

  const chooseType = (typeLabel: string) => selectOption(page, typeSelector, typeLabel);

  const fill = async (input: TCustomerFormInput) => {
    for (const name of CUSTOMER_FIELD_NAMES) {
      await field(name).fill(input[name]);
    }
  };

  return {
    main,
    eyebrow,
    heading,
    saveButton,
    deniedTitle,
    errorBanner,
    contactCard,
    summaryCard,
    identityCard,
    typeSelector,
    cancelButton,
    actionButtons,
    requiredErrors,
    backToCustomersButton,
    goto,
    fill,
    field,
    chooseType,
    findFieldHint,
    findSummaryTile,
  };
};
