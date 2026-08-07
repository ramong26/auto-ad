import { readFileSync } from "node:fs";
import { openDatabase } from "./database.ts";
import { discoverCandidates } from "./discovery.ts";
import { failDraft, finalizeDraft } from "./drafting.ts";
import { pollTopicCallbacks, sendCandidateBriefing } from "./topic-flow.ts";

const db = openDatabase();
const command = process.argv[2];

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
  if (result.candidates.length !== 3) {
    throw new Error(`only ${result.candidates.length} candidates available; ${result.failures.length} failed`);
  }
  const messageIds = await sendCandidateBriefing(
    process.env.TELEGRAM_BOT_TOKEN ?? "",
    process.env.TELEGRAM_OWNER_ID ?? "",
    result.candidates,
  );
  console.log(`sent candidate messages: ${messageIds.join(", ")}`);
  db.close();
} else if (command === "bot") {
  await pollTopicCallbacks(
    db,
    process.env.TELEGRAM_BOT_TOKEN ?? "",
    process.env.TELEGRAM_OWNER_ID ?? "",
    process.env.VAULT_PATH ?? "./vault",
  );
} else if (command === "draft-finalize") {
  const [inboxPath, preparedDraftPath] = process.argv.slice(3);
  if (!inboxPath || !preparedDraftPath) throw new Error("inbox path and prepared draft path are required");
  console.log(finalizeDraft(db, process.env.VAULT_PATH ?? "./vault", inboxPath, readFileSync(preparedDraftPath, "utf8")));
  db.close();
} else if (command === "draft-fail") {
  const [inboxPath, ...reasonParts] = process.argv.slice(3);
  if (!inboxPath || reasonParts.length === 0) throw new Error("inbox path and failure reason are required");
  console.log(failDraft(db, process.env.VAULT_PATH ?? "./vault", inboxPath, reasonParts.join(" ")));
  db.close();
} else {
  console.log(`auto-ad database ready: ${process.env.DATABASE_PATH ?? "./data/app.db"}`);
  db.close();
}
