import { readFileSync } from "node:fs";
import { openDatabase } from "./database.ts";
import { discoverCandidates } from "./discovery.ts";
import { failDraft, finalizeDraft, frontMatter, recordOperationalFailure } from "./drafting.ts";
import { findTelegramOwnerId, pollTopicCallbacks, sendCandidateBriefing, sendDraftReviewNotice, sendFailureNotice } from "./topic-flow.ts";

const db = openDatabase();
const command = process.argv[2];
const vaultPath = process.env.VAULT_PATH ?? "./vault";

function recordFailure(scope: string, error: unknown): void {
  recordOperationalFailure(vaultPath, scope, error instanceof Error ? error.message : String(error));
}

async function notifyFailure(scope: string, error: unknown): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  recordOperationalFailure(vaultPath, scope, reason);
  try {
    await sendFailureNotice(
      process.env.TELEGRAM_BOT_TOKEN ?? "",
      process.env.TELEGRAM_OWNER_ID ?? "",
      scope,
      reason,
    );
  } catch (noticeError) {
    recordFailure("telegram-failure-notice", noticeError);
  }
}

async function notifyDraft(draftPath: string): Promise<number> {
  const metadata = frontMatter(readFileSync(draftPath, "utf8"));
  try {
    return await sendDraftReviewNotice(
      process.env.TELEGRAM_BOT_TOKEN ?? "",
      process.env.TELEGRAM_OWNER_ID ?? "",
      draftPath,
      metadata.title ?? "",
      metadata.summary ?? "",
    );
  } catch (error) {
    recordFailure("draft-review-notice", error);
    throw error;
  }
}

if (command === "discover") {
  const seeds = (process.env.SEED_KEYWORDS ?? "").split(",").map((keyword) => keyword.trim()).filter(Boolean)
    .map((keyword) => ({ keyword, conceptFit: 80, risk: "low" as const }));
  if (seeds.length < 3) throw new Error("SEED_KEYWORDS must contain at least 3 comma-separated keywords");
  const runDate = new Intl.DateTimeFormat("sv-SE", { timeZone: process.env.TZ ?? "Asia/Seoul" }).format(new Date());
  const result = await discoverCandidates(
    db,
    process.env.BLOG_ID ?? "digital-life",
    runDate,
    seeds,
    { keyId: process.env.NAVER_API_KEY_ID ?? "", key: process.env.NAVER_API_KEY ?? "" },
  );
  if (result.failures.length > 0) {
    await notifyFailure("discovery", result.failures.map(({ keyword, reason }) => `${keyword}: ${reason}`).join("; "));
  }
  if (result.candidates.length !== 3) {
    throw new Error(`only ${result.candidates.length} candidates available; ${result.failures.length} failed`);
  }
  let messageIds: number[];
  try {
    messageIds = await sendCandidateBriefing(
      process.env.TELEGRAM_BOT_TOKEN ?? "",
      process.env.TELEGRAM_OWNER_ID ?? "",
      result.candidates,
    );
  } catch (error) {
    await notifyFailure("telegram-candidates", error);
    throw error;
  }
  console.log(`sent candidate messages: ${messageIds.join(", ")}`);
  db.close();
} else if (command === "bot") {
  await pollTopicCallbacks(
    db,
    process.env.TELEGRAM_BOT_TOKEN ?? "",
    process.env.TELEGRAM_OWNER_ID ?? "",
    vaultPath,
    fetch,
    (error) => recordFailure("bot-callback", error),
  );
} else if (command === "telegram-whoami") {
  console.log(`TELEGRAM_OWNER_ID=${await findTelegramOwnerId(process.env.TELEGRAM_BOT_TOKEN ?? "")}`);
  db.close();
} else if (command === "draft-finalize") {
  const [inboxPath, preparedDraftPath] = process.argv.slice(3);
  if (!inboxPath || !preparedDraftPath) throw new Error("inbox path and prepared draft path are required");
  const outputPath = finalizeDraft(db, vaultPath, inboxPath, readFileSync(preparedDraftPath, "utf8"));
  console.log(outputPath);
  console.log(`sent draft review message: ${await notifyDraft(outputPath)}`);
  db.close();
} else if (command === "draft-notify") {
  const draftPath = process.argv[3];
  if (!draftPath) throw new Error("draft path is required");
  console.log(`sent draft review message: ${await notifyDraft(draftPath)}`);
  db.close();
} else if (command === "draft-fail") {
  const [inboxPath, ...reasonParts] = process.argv.slice(3);
  if (!inboxPath || reasonParts.length === 0) throw new Error("inbox path and failure reason are required");
  const reason = reasonParts.join(" ");
  console.log(failDraft(db, vaultPath, inboxPath, reason));
  try {
    await sendFailureNotice(
      process.env.TELEGRAM_BOT_TOKEN ?? "",
      process.env.TELEGRAM_OWNER_ID ?? "",
      "codex-draft",
      reason,
    );
  } catch (error) {
    recordFailure("telegram-failure-notice", error);
  }
  db.close();
} else {
  console.log(`auto-ad database ready: ${process.env.DATABASE_PATH ?? "./data/app.db"}`);
  db.close();
}
