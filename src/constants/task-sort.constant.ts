export const TASK_SORT_MODES = {
  DEFAULT: "default",
  EARLIEST: "due_date_asc",
  LATEST: "due_date_desc",
} as const;

export type TaskSortModeType = (typeof TASK_SORT_MODES)[keyof typeof TASK_SORT_MODES];

export const TASK_SORT_COPY = {
  ALL: "הכל",
  OVERDUE: "באיחור",
  LABEL: "מיון משימות",
  DEFAULT: "דחופות תחילה",
  EARLIEST: "תאריך יעד — הקרוב תחילה",
  LATEST: "תאריך יעד — הרחוק תחילה",
  RETRY: "נסה שוב",
  NO_DUE_LAST: "ללא תאריך בסוף",
  REQUEST_ERROR: "לא ניתן לטעון את סדר המשימות כרגע",
} as const;

export const TASK_SORT_FIXTURE = {
  PREFIX: "בדיקת מיון",
  ACKNOWLEDGE_PREFIX: "qaTaskSort",
  PAGE_SIZE: 3,
  VIEWPORT: { width: 390, height: 844 },
  ROUTE: "**/api/task/my-tasks?*",
  ENDPOINT: "/task/my-tasks",
  TITLE_DIGITS: 2,
  URGENCY_INTERVAL: 3,
  URGENT_UNDATED_INDEX: 5,
  STATUS_INTERVAL: 2,
  MAX_PAGES: 20,
  DATES: [
    "2000-01-01T00:00:00.000Z",
    "2099-01-03T00:00:00.000Z",
    "2099-01-01T00:00:00.000Z",
    "2099-01-01T00:00:00.000Z",
    null,
    null,
    "2099-01-02T12:00:00.000Z",
    "2099-01-02T00:00:00.000Z",
    null,
    "2099-01-03T00:00:00.000Z",
    null,
    "2099-01-01T00:00:00.000Z",
  ],
} as const;
