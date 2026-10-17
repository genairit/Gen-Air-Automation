import type { Page } from "@playwright/test";
import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { findListUnderTitle } from "./field.component.ts";
import { PROJECT_PAGE_COPY } from "../constants/copy.constant.ts";
import { buildProjectRoute } from "../utilities/route.utility.ts";
import { buildPrefixPattern } from "../utilities/regex.utility.ts";

export const createProjectPage = (page: Page) => {
  const uploadInput = page.locator("input[type=file]");
  const editButton = page.getByRole("button", { name: PROJECT_PAGE_COPY.EDIT });
  const newTaskButton = page.getByRole("button", { name: PROJECT_PAGE_COPY.NEW_TASK });
  const timeline = findListUnderTitle(page, PROJECT_PAGE_COPY.TIMELINE_TITLE);
  const addApartmentButton = page.getByRole("button", { name: PROJECT_PAGE_COPY.ADD_APARTMENT });
  const apartmentSearch = page.getByPlaceholder(PROJECT_PAGE_COPY.APARTMENT_SEARCH_PLACEHOLDER);

  const goto = (projectId: string) => page.goto(buildProjectRoute(projectId));

  const heading = (projectName: string) => page.getByRole("heading", { name: projectName });

  const findApartmentRow = (text: string) => findTableRow(page, text);

  const driveFolder = (folderName: string) =>
    page.getByRole("button", { name: buildPrefixPattern(folderName) });

  const statusTab = (statusName: string) => findCountedTab(page, statusName);

  return {
    timeline,
    editButton,
    uploadInput,
    newTaskButton,
    apartmentSearch,
    addApartmentButton,
    goto,
    heading,
    statusTab,
    driveFolder,
    findApartmentRow,
  };
};
