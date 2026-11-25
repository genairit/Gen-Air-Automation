export const JENNY_API_PATH = "/jenny/chat";
export const FAKE_OPENAI_CHAT_PATH = "/v1/chat/completions";

export const JENNY_TOOL = {
  STATUS: "getProjectStatus",
  QUOTATION: "getQuotation",
  DOCUMENTS: "listProjectDocuments",
  SEARCH: "searchProjectDocuments",
} as const;

export const JENNY_QUESTION = {
  SUMMARY: "מהו שלב הפרויקט ומהם סכומי הצעת המחיר?",
  DOCUMENTS: "אילו מסמכים בתיק ומה כתוב על המאייד?",
  PERMISSIONS: "איזה מידע זמין לך בתיק הזה?",
} as const;

export const JENNY_PDF = {
  FILE_PREFIX: "qa-jenny-pdf-",
  QUERY: "evaporator",
  TEXT: "The design uses the Everest evaporator on the second floor.",
  EXPECTED_MATCH: "Everest",
} as const;

export const JENNY_REPLIES = {
  NO_QUOTATION: "לא מצאתי הצעת מחיר.",
  LIMITED_ACCESS: "זמין לי רק מידע על מצב הפרויקט.",
} as const;
