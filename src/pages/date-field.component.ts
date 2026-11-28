import type { Locator, Page } from "@playwright/test";

const UTC_CALENDAR_HOUR = 12;

const MONTH_FORMAT = new Intl.DateTimeFormat("he-IL", {
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jerusalem",
});

const DAY_FORMAT = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  year: "numeric",
  month: "2-digit",
  timeZone: "Asia/Jerusalem",
});

const getIsraelCalendarDate = (): Date => {
  const parts = DAY_FORMAT.formatToParts(new Date());
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  const day = Number(parts.find(part => part.type === "day")?.value);
  return new Date(Date.UTC(year, month - 1, day, UTC_CALENDAR_HOUR));
};

export const parseDateInputValue = (value: string): Date =>
  new Date(`${value}T${String(UTC_CALENDAR_HOUR).padStart(2, "0")}:00:00Z`);

export const getUpcomingDate = (daysAhead: number): Date => {
  const date = getIsraelCalendarDate();
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date;
};

const getUtcDateParts = (date: Date) => ({
  year: String(date.getUTCFullYear()),
  month: String(date.getUTCMonth() + 1).padStart(2, "0"),
  day: String(date.getUTCDate()).padStart(2, "0"),
});

export const toDateInputValue = (date: Date): string => {
  const { year, month, day } = getUtcDateParts(date);
  return `${year}-${month}-${day}`;
};

export const toDateDisplayValue = (date: Date): string => {
  const { year, month, day } = getUtcDateParts(date);
  return `${day}/${month}/${year}`;
};

export const findDueDateField = (page: Page): Locator =>
  page.getByRole("textbox", { name: /^תאריך יעד/ });

export const findDateCalendar = (page: Page): Locator =>
  page.locator(".MuiPopover-paper").filter({ has: page.getByRole("grid") });

export const selectDueDate = async (page: Page, date: Date): Promise<void> => {
  await findDueDateField(page).click();
  const calendar = findDateCalendar(page);
  const targetMonth = MONTH_FORMAT.format(date);
  const today = getIsraelCalendarDate();
  const monthsAhead =
    (date.getUTCFullYear() - today.getUTCFullYear()) * 12 +
    date.getUTCMonth() -
    today.getUTCMonth();

  for (const _ of Array.from({ length: monthsAhead })) {
    await calendar.getByRole("button", { name: "חודש הבא" }).click();
  }

  await calendar
    .getByRole("grid", { name: targetMonth })
    .locator('button[role="gridcell"]:not(.MuiPickerDay-dayOutsideMonth)', {
      hasText: new RegExp(`^${date.getUTCDate()}$`),
    })
    .click();
};
