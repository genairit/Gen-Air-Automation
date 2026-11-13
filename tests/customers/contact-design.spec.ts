import { test, expect } from "../../src/fixtures/test.fixture.ts";
import { seedCustomer, seedBuilding, seedApartment } from "../../src/api/seed-data.ts";
import { buildCustomerRoute, buildApartmentRoute } from "../../src/utilities/route.utility.ts";

test("customer and apartment pages omit retired contact panels", async ({ page, api }) => {
  const customer = await seedCustomer(api);
  await page.goto(buildCustomerRoute(customer.id));
  await expect(
    page.getByText(
      "רישומים קיימים נשמרו. אנשי קשר חדשים מנוהלים במדריך ומשויכים לפרויקט או לדירה.",
    ),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "הוספת איש קשר" })).toHaveCount(0);
  const building = await seedBuilding(api, customer);
  const apartment = await seedApartment(api, building);
  await page.goto(buildApartmentRoute(building.id, apartment.id));
  await expect(
    page.getByText(
      "רישומים קיימים נשמרו. אנשי קשר חדשים מנוהלים במדריך ומשויכים לפרויקט או לדירה.",
    ),
  ).toHaveCount(0);
  await expect(page.getByText("איש קשר היסטורי בדירה", { exact: true })).toHaveCount(0);
});
