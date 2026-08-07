import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { getPublication, openDatabase } from "./database.ts";
import { discoverCandidates, type TopicSeed } from "./discovery.ts";
import { finalizeDraft, frontMatter, recordOperationalFailure } from "./drafting.ts";
import { handlePublicationCallback, sendDraftReview, stageWordPressDraft, WordPressAuthError } from "./publishing.ts";
import { callbackErrorMessage, handleTopicCallback, sendCandidateBriefing, sendFailureNotice } from "./topic-flow.ts";

function trend(runDate: string, recent: number): object {
  const end = new Date(`${runDate}T00:00:00Z`);
  const start = new Date(end.getTime() - 13 * 86_400_000);
  return { results: [{ data: Array.from({ length: 14 }, (_, index) => ({
    period: new Date(start.getTime() + index * 86_400_000).toISOString().slice(0, 10),
    ratio: index < 7 ? 10 : recent,
  })) }] };
}

function completedDraft(source: string): string {
  const metadata = frontMatter(source);
  return `---
id: ${JSON.stringify(metadata.id)}
status: review
blog: ${JSON.stringify(metadata.blog)}
keyword: ${JSON.stringify(metadata.keyword)}
title: "스마트폰 저장 공간 안전하게 정리하는 순서"
summary: "사진을 지우기 전에 확인할 백업과 정리 순서입니다."
metaDescription: "스마트폰 저장 공간을 안전하게 확보하는 체크리스트입니다."
---

## WordPress HTML
<article><p><a href="https://support.google.com/photos/">공식 도움말</a>을 확인하고 백업부터 점검합니다.</p></article>

## 체크리스트
- 사진 한 장을 직접 열어 백업을 확인한다.

## 출처
- [Google 포토 도움말](https://support.google.com/photos/)
`;
}

test("README MVP 12-step scenario completes once without duplicate publication", async (t) => {
  const db = openDatabase(":memory:");
  const vault = mkdtempSync(join(tmpdir(), "auto-ad-mvp-"));
  t.after(() => { db.close(); rmSync(vault, { recursive: true, force: true }); });
  const steps: string[] = [];
  const seeds: TopicSeed[] = [
    { keyword: "스마트폰 저장 공간", conceptFit: 95, risk: "low" },
    { keyword: "윈도우 업데이트", conceptFit: 90, risk: "low" },
    { keyword: "PDF 합치기", conceptFit: 85, risk: "low" },
  ];
  const naver = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { keywordGroups: Array<{ groupName: string }> };
    const growth = new Map([["스마트폰 저장 공간", 18], ["윈도우 업데이트", 16], ["PDF 합치기", 14]]);
    return Response.json(trend("2026-08-07", growth.get(body.keywordGroups[0]!.groupName) ?? 10));
  }) as typeof fetch;
  steps.push("1. 오전 예약 작업 실행");
  const discovery = await discoverCandidates(db, "digital-life", "2026-08-07", seeds, { keyId: "id", key: "key" }, naver);
  assert.equal(discovery.candidates.length, 3);
  steps.push("2. NAVER 데이터로 후보 3개 생성");

  const telegramPayloads: Array<Record<string, unknown>> = [];
  const telegram = (async (_input: string | URL | Request, init?: RequestInit) => {
    telegramPayloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ ok: true, result: { message_id: telegramPayloads.length } });
  }) as typeof fetch;
  assert.deepEqual(await sendCandidateBriefing("token", "123", discovery.candidates, telegram), [1, 2, 3]);
  steps.push("3. Telegram으로 후보 수신");
  const jobId = discovery.candidates[0]!.jobId;
  const topicCallback = { id: "topic", from: { id: 123 }, data: `topic:write:${jobId}` };
  const selected = handleTopicCallback(db, topicCallback, "123", vault, new Date("2026-08-07T00:00:00Z"));
  steps.push("4. 사용자가 하나 승인");
  assert.ok(selected.inboxPath && existsSync(selected.inboxPath));
  steps.push("5. Obsidian inbox 생성");
  assert.equal(handleTopicCallback(db, topicCallback, "123", vault, new Date("2026-08-07T01:00:00Z")).inboxPath, selected.inboxPath);

  const draftPath = finalizeDraft(db, vault, selected.inboxPath!, completedDraft(readFileSync(selected.inboxPath!, "utf8")));
  steps.push("6. Codex가 초안 작성");
  const config = { baseUrl: "https://blog.example.com", username: "author", applicationPassword: "app password", categoryId: 7 };
  let draftCreates = 0;
  let publishes = 0;
  const wordpress = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET") return Response.json([]);
    const body = JSON.parse(String(init?.body)) as { status: string };
    if (url.endsWith("/posts")) {
      draftCreates += 1;
      return Response.json({ id: 42, slug: "스마트폰-저장-공간-안전하게-정리하는-순서", status: "draft", link: "https://blog.example.com/?p=42" });
    }
    assert.equal(body.status, "publish");
    publishes += 1;
    return Response.json({
      id: 42, slug: "스마트폰-저장-공간-안전하게-정리하는-순서", status: "publish",
      link: "https://blog.example.com/smartphone-storage/", date_gmt: "2026-08-07T02:00:00",
    });
  }) as typeof fetch;
  const staged = await stageWordPressDraft(db, jobId, readFileSync(draftPath, "utf8"), config, wordpress);
  await sendDraftReview("token", "123", jobId, "스마트폰 저장 공간 안전하게 정리하는 순서", staged.wordpress_url!, staged.review_token!, telegram);
  steps.push("7. Telegram으로 초안 알림");
  const publishCallback = { id: "publish", from: { id: 123 }, data: `publish:approve:${jobId}:${staged.review_token}` };
  steps.push("8. 사용자가 발행 승인");
  const message = await handlePublicationCallback(db, publishCallback, "123", vault, config, wordpress);
  steps.push("9. WordPress publish 생성");
  assert.match(message, /https:\/\/blog\.example\.com\/smartphone-storage\//u);
  assert.equal(getPublication(db, jobId)!.status, "published");
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(jobId)!.status, "published");
  assert.equal(readdirSync(join(vault, "40-published")).length, 1);
  steps.push("10. 발행 URL 기록");

  await handlePublicationCallback(db, publishCallback, "123", vault, config, wordpress);
  assert.deepEqual({ draftCreates, publishes, publications: db.prepare("SELECT count(*) AS count FROM publications").get()!.count },
    { draftCreates: 1, publishes: 1, publications: 1 });
  steps.push("11. 같은 작업 재실행 시 중복 발행 없음");
  const failurePath = recordOperationalFailure(vault, "telegram", "sendMessage failed with 503", "2026-08-07T03:00:00Z");
  assert.match(readFileSync(failurePath, "utf8"), /\[telegram\] sendMessage failed with 503/u);
  assert.match(callbackErrorMessage(new WordPressAuthError("401")), /인증 실패/u);
  steps.push("12. 실패 시 원인을 Telegram과 파일에 남김");

  assert.deepEqual(steps, [
    "1. 오전 예약 작업 실행", "2. NAVER 데이터로 후보 3개 생성", "3. Telegram으로 후보 수신",
    "4. 사용자가 하나 승인", "5. Obsidian inbox 생성", "6. Codex가 초안 작성",
    "7. Telegram으로 초안 알림", "8. 사용자가 발행 승인", "9. WordPress publish 생성",
    "10. 발행 URL 기록", "11. 같은 작업 재실행 시 중복 발행 없음", "12. 실패 시 원인을 Telegram과 파일에 남김",
  ]);
});

test("Telegram failure is retained in the Vault fallback log", async (t) => {
  const vault = mkdtempSync(join(tmpdir(), "auto-ad-telegram-failure-"));
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  let notice = "";
  const workingTelegram = (async (_input: string | URL | Request, init?: RequestInit) => {
    notice = String((JSON.parse(String(init?.body)) as { text: string }).text);
    return Response.json({ ok: true, result: { message_id: 1 } });
  }) as typeof fetch;
  await sendFailureNotice("token", "123", "codex-draft", "official sources missing", workingTelegram);
  assert.match(notice, /구간: codex-draft[\s\S]*사유: official sources missing/u);

  const failedTelegram = (async () => Response.json({ ok: false }, { status: 503 })) as typeof fetch;
  try {
    await sendFailureNotice("token", "123", "codex-draft", "official sources missing", failedTelegram);
    assert.fail("Telegram failure must throw");
  } catch (error) {
    const path = recordOperationalFailure(vault, "telegram-failure-notice", (error as Error).message, "2026-08-07T04:00:00Z");
    assert.match(readFileSync(path, "utf8"), /Telegram sendMessage failed with 503/u);
  }
});
