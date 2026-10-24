import type { Page, Locator } from "@playwright/test";
import { findFieldByTitle } from "./field.component.ts";
import { escapeRegex } from "../utilities/regex.utility.ts";
import { APARTMENT_COPY } from "../constants/copy.constant.ts";
import { ROUTE_SEGMENTS } from "../constants/routes.constant.ts";
import { buildProjectRoute } from "../utilities/route.utility.ts";
import { APARTMENT_DESIGN_DATA as DATA } from "../constants/apartment-design.constant.ts";
import { APARTMENT_DESIGN_COPY as COPY } from "../constants/apartment-design.constant.ts";

const SECTION_XPATH = "xpath=ancestor::div[.//button][1]";
export const findApartmentSection = (page: Page, title: string): Locator =>
  page
    .locator("b")
    .filter({ hasText: new RegExp(`^${escapeRegex(title)}$`) })
    .locator(SECTION_XPATH);

export const createApartmentDesignPage = (page: Page) => {
  const gotoCreate = (buildingId: string) =>
    page.goto(
      `${buildProjectRoute(buildingId)}/${ROUTE_SEGMENTS.APARTMENTS}/${ROUTE_SEGMENTS.NEW}`,
    );
  const search = page.getByPlaceholder(COPY.CUSTOMER_SEARCH);
  const submit = page.getByRole("button", { name: APARTMENT_COPY.ADD, exact: true });
  const fillUnit = async (number: string, floor = DATA.FLOOR) => {
    await findFieldByTitle(page, APARTMENT_COPY.FLOOR).fill(floor);
    await findFieldByTitle(page, APARTMENT_COPY.NUMBER).fill(number);
  };
  const pickCustomer = async (name: string) => {
    await search.fill(name);
    await page.getByRole("option").filter({ hasText: name }).click();
  };
  const teamCard = () => findApartmentSection(page, COPY.CONTACT_TEAM);
  const draftTeam = () => findApartmentSection(page, COPY.TEAM_TITLE);
  const selectMember = async (name: string) => {
    await page.getByPlaceholder(COPY.ADD_MEMBER).first().click();
    await page.getByPlaceholder(COPY.ADD_MEMBER).last().fill(name);
    await page.getByRole("option").filter({ hasText: name }).click();
  };
  return { gotoCreate, search, submit, fillUnit, pickCustomer, teamCard, draftTeam, selectMember };
};
