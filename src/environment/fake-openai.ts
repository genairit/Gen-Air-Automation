import {
  JENNY_PDF,
  JENNY_TOOL,
  JENNY_REPLIES,
  JENNY_QUESTION,
} from "../constants/jenny.constant.ts";

import { json } from "node:stream/consumers";
import { setTimeout } from "node:timers/promises";
import { isRecord } from "../utilities/guard.utility.ts";
import { HTTP_STATUS } from "../constants/http.constant.ts";
import type { IncomingMessage, ServerResponse } from "node:http";

const RESPONSE_DELAY_MS = 400;

type TJennyToolName = (typeof JENNY_TOOL)[keyof typeof JENNY_TOOL];
type TOpenAIMessage = Record<string, unknown>;

const toolsByQuestion: ReadonlyMap<string, TJennyToolName[]> = new Map([
  [JENNY_QUESTION.SUMMARY, [JENNY_TOOL.STATUS, JENNY_TOOL.QUOTATION]],
  [JENNY_QUESTION.DOCUMENTS, [JENNY_TOOL.DOCUMENTS, JENNY_TOOL.SEARCH]],
  [JENNY_QUESTION.PERMISSIONS, Object.values(JENNY_TOOL)],
]);

const toolResults = (messages: TOpenAIMessage[]) =>
  new Map(
    messages
      .filter(message => message.role === "tool")
      .map(message => [message.tool_call_id, JSON.parse(String(message.content)) as unknown]),
  );

const records = (value: unknown): TOpenAIMessage[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const recordCollection = (value: unknown, key: string): TOpenAIMessage[] =>
  isRecord(value) ? records(value[key]) : [];

const toolResultText = (results: Map<unknown, unknown>, name: TJennyToolName): string => {
  const value = results.get(name);
  if (!isRecord(value) || typeof value.error === "string") {
    throw new Error(`The Jenny tool did not return data: ${name}`);
  }

  const renderers: Record<TJennyToolName, () => string> = {
    [JENNY_TOOL.STATUS]: () => `השלב של ${value.name} הוא ${value.stage}.`,
    [JENNY_TOOL.QUOTATION]: () => {
      const [quote] = recordCollection(value, "quotations");
      if (!quote) {
        return JENNY_REPLIES.NO_QUOTATION;
      }

      return [
        `הצעה ${quote.number}, גרסה ${quote.version}, מע״מ ${quote.vatRatePercent}%.`,
        `לפני מע״מ: ${quote.totalBeforeVat}.`,
        `כולל מע״מ: ${quote.totalWithVat}.`,
      ].join(" ");
    },
    [JENNY_TOOL.DOCUMENTS]: () =>
      `מצאתי קבצים: ${recordCollection(value, "files")
        .map(file => file.name)
        .join(", ")}.`,
    [JENNY_TOOL.SEARCH]: () =>
      recordCollection(value, "hits")
        .map(hit => `לפי ${hit.fileName}, עמוד ${hit.page}:\n\n${hit.snippet}`)
        .join("\n\n"),
  };

  return renderers[name]();
};

const requestedToolNames = (body: TOpenAIMessage): unknown[] =>
  records(body.tools).map(({ function: definition }) =>
    isRecord(definition) ? definition.name : null,
  );

const toolCall = (name: TJennyToolName) => ({
  id: name,
  type: "function",
  function: {
    name,
    arguments: JSON.stringify(name === JENNY_TOOL.SEARCH ? { query: JENNY_PDF.QUERY } : {}),
  },
});

const buildCompletion = (body: unknown): object => {
  if (!isRecord(body)) {
    throw new Error("Expected an OpenAI chat request");
  }

  const messages = records(body.messages);
  const systemMessage = messages.find(message => message.role === "system");
  if (typeof systemMessage?.content !== "string" || !systemMessage.content.includes("בעברית")) {
    throw new Error("Jenny must ask the model to respond in Hebrew");
  }

  const questionIndex = messages.findLastIndex(message => message.role === "user");
  const question = messages[questionIndex]?.content;
  const wantedTools = toolsByQuestion.get(String(question));
  if (!wantedTools) {
    throw new Error("Unrecognized Jenny test question");
  }

  const names = requestedToolNames(body);
  if (names.some(name => !Object.values(JENNY_TOOL).some(tool => tool === name))) {
    throw new Error("Jenny exposed a tool outside the read-only project tools");
  }

  const tools = wantedTools.filter(name => names.includes(name));
  const results = toolResults(messages.slice(questionIndex + 1));
  const needsTools = results.size === 0;
  if (question === JENNY_QUESTION.PERMISSIONS && tools.join() !== JENNY_TOOL.STATUS) {
    throw new Error("Jenny exposed a tool the test user cannot access");
  }

  const toolCalls = needsTools ? tools.map(toolCall) : [];
  const resultText = () => tools.map(name => toolResultText(results, name)).filter(Boolean);
  const answer = () => {
    const paragraphs = resultText();
    return question === JENNY_QUESTION.PERMISSIONS
      ? [...paragraphs, JENNY_REPLIES.LIMITED_ACCESS].join("\n\n")
      : paragraphs.join("\n\n");
  };
  const requestsTools = toolCalls.length > 0;

  return {
    id: "qa-chat",
    model: body.model,
    usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    choices: [
      {
        finish_reason: requestsTools ? "tool_calls" : "stop",
        index: 0,
        message: {
          role: "assistant",
          content: requestsTools ? null : answer(),
          tool_calls: toolCalls,
        },
      },
    ],
  };
};

export const answerFakeOpenAI = async (
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> => {
  const completion = buildCompletion(await json(request));
  await setTimeout(RESPONSE_DELAY_MS);
  response.writeHead(HTTP_STATUS.OK, { "Content-Type": "application/json" });
  response.end(JSON.stringify(completion));
};
