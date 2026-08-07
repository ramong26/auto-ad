import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSlug, isTelegramOwner } from "./core.ts";
import {
  claimApproval,
  completeApproval,
  getJob,
  getTopicDetails,
  transitionJob,
  type TopicDetails,
} from "./database.ts";
import type { TopicCandidate } from "./discovery.ts";

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
}

interface TelegramMessage {
  message_id: number;
}

export interface TelegramCallback {
  id: string;
  from: { id: number };
  data?: string;
}

interface TelegramUpdate {
  update_id: number;
  callback_query?: TelegramCallback;
}

export interface CallbackResult {
  action: "write" | "other" | "hold" | "skip";
  jobId: number;
  inboxPath: string | null;
}

export async function callTelegram<T>(
  token: string,
  method: string,
  payload: object,
  request: typeof fetch,
): Promise<T> {
  if (!token) throw new Error("Telegram bot token is required");
  const response = await request(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  let body: TelegramResponse<T>;
  try {
    body = await response.json() as TelegramResponse<T>;
  } catch {
    throw new Error(`Telegram ${method} returned invalid JSON`);
  }
  if (!response.ok || !body.ok || body.result === undefined) {
    throw new Error(`Telegram ${method} failed with ${response.status}`);
  }
  return body.result;
}

export async function sendCandidateBriefing(
  token: string,
  ownerId: string,
  candidates: readonly TopicCandidate[],
  request: typeof fetch = fetch,
): Promise<number[]> {
  if (candidates.length !== 3) throw new Error("exactly 3 candidates are required");
  if (!ownerId.trim()) throw new Error("Telegram owner ID is required");
  const messageIds: number[] = [];
  for (const [index, candidate] of candidates.entries()) {
    const growth = `${candidate.growth >= 0 ? "+" : ""}${candidate.growth.toFixed(1)}%`;
    const message = await callTelegram<TelegramMessage>(token, "sendMessage", {
      chat_id: ownerId.trim(),
      text: [
        `[오늘의 주제 후보 ${index + 1}/3]`,
        "",
        `키워드: ${candidate.keyword}`,
        `전주 대비: ${growth}`,
        `점수: ${candidate.score.toFixed(1)}`,
        `콘셉트 적합성: ${candidate.conceptFit}`,
        `위험도: ${candidate.risk}`,
      ].join("\n"),
      reply_markup: {
        inline_keyboard: [
          [{ text: "글 작성", callback_data: `topic:write:${candidate.jobId}` }],
          [{ text: "다른 주제", callback_data: `topic:other:${candidate.jobId}` }],
          [{ text: "보류", callback_data: `topic:hold:${candidate.jobId}` }],
          [{ text: "오늘 건너뛰기", callback_data: `topic:skip:${candidate.jobId}` }],
        ],
      },
    }, request);
    messageIds.push(message.message_id);
  }
  return messageIds;
}

export async function sendFailureNotice(
  token: string,
  ownerId: string,
  scope: string,
  reason: string,
  request: typeof fetch = fetch,
): Promise<number> {
  if (!ownerId.trim() || !scope.trim() || !reason.trim()) throw new Error("failure notice fields are required");
  const message = await callTelegram<TelegramMessage>(token, "sendMessage", {
    chat_id: ownerId.trim(),
    text: `[자동화 실패]\n\n구간: ${scope.trim()}\n사유: ${reason.trim()}`,
  }, request);
  return message.message_id;
}

function inboxMarkdown(
  job: NonNullable<ReturnType<typeof getJob>>,
  candidate: TopicDetails,
  createdAt: string,
): string {
  return [
    "---",
    `id: ${JSON.stringify(`${job.runDate}-${createSlug(job.keyword)}-${job.id}`)}`,
    "status: inbox",
    `blog: ${JSON.stringify(job.blog)}`,
    `keyword: ${JSON.stringify(job.keyword)}`,
    `trendGrowth: ${candidate.growth}`,
    `score: ${candidate.score}`,
    `risk: ${candidate.risk}`,
    `createdAt: ${JSON.stringify(createdAt)}`,
    "---",
    "",
    "# 작성 요청",
    "",
    "## 검색 데이터",
    "",
    `- 전주 대비 증가율: ${candidate.growth.toFixed(1)}%`,
    `- 후보 점수: ${candidate.score.toFixed(1)}`,
    "",
    "## 작성 조건",
    "",
    "- 블로그 persona와 금지 주제를 확인한다.",
    "- 공식 출처와 확인 날짜를 남긴다.",
    "- 사용자 승인 전에는 발행하지 않는다.",
    "",
  ].join("\n");
}

export function handleTopicCallback(
  db: DatabaseSync,
  callback: TelegramCallback,
  ownerId: string,
  vaultPath: string,
  now = new Date(),
): CallbackResult {
  if (!isTelegramOwner(callback.from.id, ownerId)) throw new Error("Telegram user is not allowed");
  const match = /^topic:(write|other|hold|skip):(\d+)$/u.exec(callback.data ?? "");
  if (!match) throw new Error("invalid or expired topic callback");
  const action = match[1] as CallbackResult["action"];
  const jobId = Number(match[2]);
  let job = getJob(db, jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: process.env.TZ ?? "Asia/Seoul" }).format(now);
  if (job.runDate !== today) throw new Error("topic callback expired");
  const candidate = getTopicDetails(db, jobId);
  if (!candidate) throw new Error("candidate is unavailable or expired");
  const approval = claimApproval(db, jobId, String(callback.from.id), action);
  if (approval.status === "completed") return { action, jobId, inboxPath: approval.inboxPath };

  if (action !== "write") {
    completeApproval(db, jobId, null);
    return { action, jobId, inboxPath: null };
  }
  if (job.status === "candidate") job = transitionJob(db, jobId, "selected");
  if (job.status === "selected") job = transitionJob(db, jobId, "inbox");
  if (job.status !== "inbox") throw new Error(`job ${jobId} cannot enter inbox from ${job.status}`);

  const inboxDirectory = resolve(vaultPath, "00-inbox");
  mkdirSync(inboxDirectory, { recursive: true });
  const inboxPath = resolve(inboxDirectory, `${job.runDate}-${createSlug(job.keyword)}-${job.id}.md`);
  try {
    writeFileSync(inboxPath, inboxMarkdown(job, candidate, now.toISOString()), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  completeApproval(db, jobId, inboxPath);
  return { action, jobId, inboxPath };
}

export async function answerTopicCallback(
  token: string,
  callbackId: string,
  text: string,
  request: typeof fetch = fetch,
): Promise<void> {
  await callTelegram<boolean>(token, "answerCallbackQuery", {
    callback_query_id: callbackId,
    text,
  }, request);
}

export async function pollTopicCallbacks(
  db: DatabaseSync,
  token: string,
  ownerId: string,
  vaultPath: string,
  request: typeof fetch = fetch,
  publicationHandler?: (callback: TelegramCallback) => Promise<string>,
  failureHandler?: (error: unknown) => void,
): Promise<never> {
  let offset = 0;
  for (;;) {
    let updates: TelegramUpdate[];
    try {
      updates = await callTelegram<TelegramUpdate[]>(token, "getUpdates", {
        offset,
        timeout: 30,
        allowed_updates: ["callback_query"],
      }, request);
    } catch (error) {
      failureHandler?.(error);
      throw error;
    }
    for (const update of updates) {
      offset = update.update_id + 1;
      const callback = update.callback_query;
      if (!callback) continue;
      try {
        if (callback.data?.startsWith("publish:")) {
          if (!publicationHandler) throw new Error("publication handler is unavailable");
          await answerTopicCallback(token, callback.id, await publicationHandler(callback), request);
          continue;
        }
        const result = handleTopicCallback(db, callback, ownerId, vaultPath);
        await answerTopicCallback(token, callback.id, result.inboxPath ? "inbox에 추가했습니다." : "처리했습니다.", request);
      } catch (error) {
        failureHandler?.(error);
        const message = callbackErrorMessage(error);
        await answerTopicCallback(token, callback.id, message, request);
      }
    }
  }
}

export function callbackErrorMessage(error: unknown): string {
  return error instanceof Error && error.name === "WordPressAuthError"
    ? "WordPress 인증 실패: Application Password를 확인하세요."
    : "처리할 수 없습니다.";
}
