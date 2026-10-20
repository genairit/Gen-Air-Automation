import type { Page } from "@playwright/test";
import { createProjectPage } from "./project.page.ts";
import { MANAGEMENT_FILE, MANAGEMENT_FOLDERS } from "../mocks/drive-management.mock.ts";
import { DRIVE_MANAGEMENT_COPY as COPY } from "../constants/drive-management.constant.ts";

export const createDriveManagement = (page: Page) => {
  const project = createProjectPage(page);
  const dialog = page.getByRole("dialog");
  const confirmMove = dialog.getByRole("button", { name: COPY.MOVE_CONFIRM, exact: true });
  const cancel = dialog.getByRole("button", { name: COPY.CANCEL, exact: true });
  const move = project.driveCard.getByRole("button", {
    name: `${COPY.MOVE} ${MANAGEMENT_FILE.name}`,
    exact: true,
  });
  const trash = project.driveCard.getByRole("button", {
    name: `${COPY.DELETE} ${MANAGEMENT_FILE.name}`,
    exact: true,
  });
  const file = project.driveCard.getByRole("link", { name: MANAGEMENT_FILE.name, exact: true });
  const browse = (name: string) => dialog.getByRole("button", { name, exact: true }).click();
  const expandNested = async () => {
    await project.driveFolder(MANAGEMENT_FOLDERS.SOURCE.name).click();
    await project.driveFolder(MANAGEMENT_FOLDERS.NESTED.name).click();
  };
  return { ...project, file, move, trash, dialog, cancel, confirmMove, browse, expandNested };
};
