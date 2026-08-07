import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJob, openDatabase } from "./database.ts";
import { discoverCandidates, fetchTrend, trendRange, type TopicSeed } from "./discovery.ts";
import { handleTopicCallback, sendCandidateBriefing } from "./topic-flow.ts";

function trendBody(runDate: string, previousRatio = 10, recentRatio = 15): object {
  const { startDate } = trendRange(runDate);
  const start = new Date(`${startDate}T00:00:00Z`);
  return {
    results: [{
      data: Array.from({ length: 14 }, (_, index) => ({
        period: new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
        ratio: index < 7 ? previousRatio : recentRatio,
      })),
    }],
  };
}

test("Search Trend uses one 14-day response and a 24-hour cache", async () => {
  const db = openDatabase(":memory:");
  let requests = 0;
  let requestPayload: Record<string, unknown> | undefined;
  let requestUrl = "";
  let requestHeaders = new Headers();
  const request = (async (input: string | URL | Request, init?: RequestInit) => {
    requests += 1;
    requestUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    requestPayload = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify(trendBody("2026-08-07")), { status: 200 });
  }) as typeof fetch;

  const first = await fetchTrend(db, "AI PC", "2026-08-07", { keyId: "id", key: "key" }, request, 1_000_000_000);
  const cached = await fetchTrend(db, "AI PC", "2026-08-07", { keyId: "id", key: "key" }, request, 1_000_000_001);
  const expired = await fetchTrend(db, "AI PC", "2026-08-07", { keyId: "id", key: "key" }, request, 1_086_400_001);
  assert.equal(first.growth, 50);
  assert.equal(first.cached, false);
  assert.equal(cached.cached, true);
  assert.equal(expired.cached, false);
  assert.equal(requests, 2);
  assert.equal(requestUrl, "https://naverapihub.apigw.ntruss.com/search-trend/v1/search");
  assert.equal(requestHeaders.get("x-ncp-apigw-api-key-id"), "id");
  assert.equal(requestHeaders.get("x-ncp-apigw-api-key"), "key");
  assert.deepEqual(
    { startDate: requestPayload?.startDate, endDate: requestPayload?.endDate, timeUnit: requestPayload?.timeUnit },
    { startDate: "2026-07-25", endDate: "2026-08-07", timeUnit: "date" },
  );
  db.close();
});

test("429, 5xx, and empty NAVER results are rejected", async () => {
  for (const scenario of [
    { status: 429, body: {}, kind: "rate_limited" },
    { status: 503, body: {}, kind: "server" },
    { status: 200, body: { results: [] }, kind: "empty_result" },
  ]) {
    const db = openDatabase(":memory:");
    const request = (async () => new Response(JSON.stringify(scenario.body), { status: scenario.status })) as typeof fetch;
    await assert.rejects(
      fetchTrend(db, scenario.kind, "2026-08-07", { keyId: "id", key: "key" }, request),
      (error: unknown) => error instanceof Error && "kind" in error && error.kind === scenario.kind,
    );
    db.close();
  }
});

test("mock discovery sends 3 candidates and one owner approval creates one inbox file", async (t) => {
  const db = openDatabase(":memory:");
  createJob(db, "digital-life", "최근 중복", "2026-08-01");
  const seeds: TopicSeed[] = [
    { keyword: "최근 중복", conceptFit: 90, risk: "low" },
    { keyword: "고위험 투자", conceptFit: 90, risk: "high" },
    { keyword: "스마트폰 저장공간", conceptFit: 95, risk: "low" },
    { keyword: "윈도우 업데이트", conceptFit: 90, risk: "low" },
    { keyword: "PDF 합치기", conceptFit: 85, risk: "low" },
    { keyword: "낮은 적합성", conceptFit: 10, risk: "medium" },
    { keyword: "429 실패", conceptFit: 100, risk: "low" },
    { keyword: "5xx 실패", conceptFit: 100, risk: "low" },
    { keyword: "빈 결과", conceptFit: 100, risk: "low" },
  ];
  const ratios = new Map([
    ["스마트폰 저장공간", 20],
    ["윈도우 업데이트", 17],
    ["PDF 합치기", 14],
    ["낮은 적합성", 11],
  ]);
  const naverRequest = (async (_input: string | URL | Request, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { keywordGroups: Array<{ groupName: string }> };
    const keyword = payload.keywordGroups[0]!.groupName;
    if (keyword === "429 실패") return new Response("{}", { status: 429 });
    if (keyword === "5xx 실패") return new Response("{}", { status: 503 });
    if (keyword === "빈 결과") return new Response(JSON.stringify({ results: [] }), { status: 200 });
    return new Response(JSON.stringify(trendBody("2026-08-07", 10, ratios.get(keyword) ?? 10)), { status: 200 });
  }) as typeof fetch;

  const discovery = await discoverCandidates(
    db,
    "digital-life",
    "2026-08-07",
    seeds,
    { keyId: "id", key: "key" },
    naverRequest,
    1_000_000_000,
  );
  assert.equal(discovery.candidates.length, 3);
  assert.deepEqual(discovery.candidates.map(({ keyword }) => keyword), [
    "스마트폰 저장공간",
    "윈도우 업데이트",
    "PDF 합치기",
  ]);
  assert.equal(discovery.failures.length, 5);
  assert.equal(db.prepare("SELECT count(*) AS count FROM jobs WHERE status = 'failed'").get()!.count, 5);

  const telegramPayloads: Array<{
    chat_id: string;
    text: string;
    reply_markup: { inline_keyboard: Array<Array<{ text: string }>> };
  }> = [];
  const telegramUrls: string[] = [];
  const telegramRequest = (async (input: string | URL | Request, init?: RequestInit) => {
    telegramUrls.push(String(input));
    const payload = JSON.parse(String(init?.body)) as (typeof telegramPayloads)[number];
    telegramPayloads.push(payload);
    return new Response(JSON.stringify({ ok: true, result: { message_id: telegramPayloads.length } }), { status: 200 });
  }) as typeof fetch;
  assert.deepEqual(await sendCandidateBriefing("token", "123", discovery.candidates, telegramRequest), [1, 2, 3]);
  assert.equal(telegramPayloads.length, 3);
  assert.deepEqual(telegramUrls, Array(3).fill("https://api.telegram.org/bottoken/sendMessage"));
  assert.equal(telegramPayloads[0]!.chat_id, "123");
  assert.deepEqual(
    telegramPayloads[0]!.reply_markup.inline_keyboard.flat().map(({ text }) => text),
    ["글 작성", "다른 주제", "보류", "오늘 건너뛰기"],
  );

  const vaultPath = mkdtempSync(join(tmpdir(), "auto-ad-"));
  t.after(() => rmSync(vaultPath, { recursive: true, force: true }));
  const jobId = discovery.candidates[0]!.jobId;
  const callback = { id: "callback-1", from: { id: 123 }, data: `topic:write:${jobId}` };
  assert.throws(() => handleTopicCallback(db, { ...callback, from: { id: 999 } }, "123", vaultPath), /not allowed/u);
  assert.throws(
    () => handleTopicCallback(db, callback, "123", vaultPath, new Date("2026-08-08T15:00:00Z")),
    /expired/u,
  );
  const approved = handleTopicCallback(db, callback, "123", vaultPath, new Date("2026-08-07T00:00:00Z"));
  const repeated = handleTopicCallback(db, callback, "123", vaultPath, new Date("2026-08-07T01:00:00Z"));
  assert.equal(repeated.inboxPath, approved.inboxPath);
  assert.equal(readdirSync(join(vaultPath, "00-inbox")).length, 1);
  const markdown = readFileSync(approved.inboxPath!, "utf8");
  assert.match(markdown, /^---\nid: .+\nstatus: inbox\nblog: "digital-life"\nkeyword: "스마트폰 저장공간"/u);
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(jobId)!.status, "inbox");
  assert.equal(db.prepare("SELECT count(*) AS count FROM approvals").get()!.count, 1);
  db.close();
});
