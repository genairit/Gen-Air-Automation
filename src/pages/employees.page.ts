import {
  USER_ROLE_LABELS,
  type UserRoleType,
  USER_ROLE_PLURAL_LABELS,
  ASSIGNABLE_USER_ROLE_VALUES,
} from "../constants/user-role.constant.ts";

import { findTableRow } from "./table.component.ts";
import { findCountedTab } from "./tab.component.ts";
import { expect, type Page } from "@playwright/test";
import { ROUTES } from "../constants/routes.constant.ts";
import { EMPLOYEES_COPY } from "../constants/copy.constant.ts";
import { KEYBOARD_KEYS } from "../constants/keyboard.constant.ts";

export interface IEmployeeFormInput {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: UserRoleType;
  passwordConfirmation?: string;
  assignedRoles?: UserRoleType[];
}

export const createEmployeesPage = (page: Page) => {
  const form = page.getByRole("dialog");
  const createButton = page.getByRole("button", { name: EMPLOYEES_COPY.ADD_TITLE, exact: true });
  const nameInput = form.getByPlaceholder(EMPLOYEES_COPY.NAME_PLACEHOLDER);
  const emailInput = form.getByPlaceholder(EMPLOYEES_COPY.EMAIL_PLACEHOLDER);
  const phoneInput = form.getByPlaceholder(EMPLOYEES_COPY.PHONE_PLACEHOLDER);
  const searchBox = page.getByPlaceholder(EMPLOYEES_COPY.SEARCH_PLACEHOLDER);
  const addButton = form.getByRole("button", { name: EMPLOYEES_COPY.ADD_EMPLOYEE });
  const passwordInput = form.locator('input[type="password"]').first();
  const passwordConfirmationInput = form.locator('input[type="password"]').last();
  const rolePicker = form.getByRole("combobox", { name: EMPLOYEES_COPY.ROLE_LABEL });
  const roleOptions = page.getByRole("listbox").getByRole("option");
  const roleOption = (role: UserRoleType) =>
    page.getByRole("option", { name: USER_ROLE_LABELS[role], exact: true });
  const openRoles = () => rolePicker.press(KEYBOARD_KEYS.ARROW_DOWN);
  const closeRoles = () => rolePicker.press(KEYBOARD_KEYS.ESCAPE);

  const goto = () => page.goto(ROUTES.EMPLOYEES);

  const findRow = (text: string) => findTableRow(page, text);

  const openCreate = async () => {
    await createButton.click();
    await expect(nameInput).toBeFocused();
  };

  const openEdit = async (email: string) => {
    await findRow(email).getByRole("button", { name: EMPLOYEES_COPY.EDIT_EMPLOYEE }).click();
    await expect(nameInput).toBeFocused();
  };

  const roleTab = (role: UserRoleType) => findCountedTab(page, USER_ROLE_PLURAL_LABELS[role]);

  const fillEmployee = async (input: IEmployeeFormInput) => {
    const assignedRoles = input.assignedRoles ?? [input.role];
    await nameInput.fill(input.name);
    await emailInput.fill(input.email);
    await phoneInput.fill(input.phone);
    await passwordInput.fill(input.password);
    await passwordConfirmationInput.fill(input.passwordConfirmation ?? input.password);
    await openRoles();
    for (const role of ASSIGNABLE_USER_ROLE_VALUES) {
      const option = roleOption(role);
      const selected = (await option.getAttribute("aria-selected")) === "true";
      if (assignedRoles.includes(role) !== selected) {
        await option.click();
      }
    }
    await closeRoles();
  };

  const addEmployee = async (input: IEmployeeFormInput) => {
    await openCreate();
    await fillEmployee(input);
    await addButton.click();
  };

  const deleteEmployee = (text: string) =>
    findRow(text).getByRole("button", { name: EMPLOYEES_COPY.DELETE_EMPLOYEE }).click();

  return {
    openCreate,
    openEdit,
    searchBox,
    addButton,
    passwordInput,
    passwordConfirmationInput,
    form,
    nameInput,
    emailInput,
    phoneInput,
    createButton,
    rolePicker,
    openRoles,
    closeRoles,
    roleOption,
    roleOptions,
    goto,
    findRow,
    roleTab,
    addEmployee,
    fillEmployee,
    deleteEmployee,
  };
};
