import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJob, openDatabase, transitionJob } from "./database.ts";
import { failDraft, finalizeDraft } from "./drafting.ts";

const source = (id: number, status = "inbox") => `---
id: "2026-08-07-windows-backup-${id}"
status: ${status}
blog: "digital-life"
keyword: "Windows PC 백업"
---

# 작성 요청
`;

const draft = (id: number) => `---
id: "2026-08-07-windows-backup-${id}"
status: review
blog: "digital-life"
keyword: "Windows PC 백업"
title: "Windows PC 백업 확인법"
summary: "백업 상태를 확인합니다."
---

## 네이버 블로그 원고
[공식 안내](https://support.microsoft.com/ko-kr/onedrive/back-up-your-folders-with-onedrive)를 확인하고 백업 상태를 점검합니다.

## 체크리스트
- 파일 하나를 열어 본다.

## 태그
#윈도우 #PC백업 #원드라이브

## 출처
- [Microsoft Support](https://support.microsoft.com/ko-kr/onedrive/back-up-your-folders-with-onedrive)
`;

test("eligible revision request becomes one review draft without publishing", (t) => {
  const db = openDatabase(":memory:");
  const job = createJob(db, "digital-life", "Windows PC 백업", "2026-08-07");
  transitionJob(db, job.id, "selected");
  transitionJob(db, job.id, "inbox");
  transitionJob(db, job.id, "drafting");
  transitionJob(db, job.id, "review");
  transitionJob(db, job.id, "revision_requested");
  const vault = mkdtempSync(join(tmpdir(), "auto-ad-draft-"));
  t.after(() => { db.close(); rmSync(vault, { recursive: true, force: true }); });
  mkdirSync(join(vault, "00-inbox"));
  mkdirSync(join(vault, "20-drafts"));
  const inbox = join(vault, "00-inbox", "job.md");
  writeFileSync(inbox, source(job.id, "revision_requested"));
  const existingDraft = join(vault, "20-drafts", `2026-08-07-windows-backup-${job.id}.md`);
  writeFileSync(existingDraft, draft(job.id).replace("백업 상태를 확인합니다.", "이전 초안입니다."));

  const output = finalizeDraft(db, vault, inbox, draft(job.id));
  assert.equal(output, existingDraft);
  assert.doesNotMatch(readFileSync(output, "utf8"), /이전 초안/u);
  assert.match(readFileSync(output, "utf8"), /status: review/u);
  assert.match(readFileSync(inbox, "utf8"), /status: review/u);
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(job.id)!.status, "review");
  assert.equal(db.prepare("SELECT count(*) AS count FROM publications").get()!.count, 0);
  assert.throws(() => finalizeDraft(db, vault, inbox, draft(job.id)), /not eligible/u);
});

test("source shortage creates a traceable failure record", (t) => {
  const db = openDatabase(":memory:");
  const job = createJob(db, "digital-life", "Windows PC 백업", "2026-08-07");
  transitionJob(db, job.id, "selected");
  transitionJob(db, job.id, "inbox");
  const vault = mkdtempSync(join(tmpdir(), "auto-ad-failed-"));
  t.after(() => { db.close(); rmSync(vault, { recursive: true, force: true }); });
  mkdirSync(join(vault, "00-inbox"));
  mkdirSync(join(vault, "90-failed"));
  const inbox = join(vault, "00-inbox", "job.md");
  writeFileSync(inbox, source(job.id));

  const output = failDraft(db, vault, inbox, "중요 주장을 뒷받침할 공식 출처 부족", "2026-08-07T09:00:00+09:00");
  assert.match(readFileSync(output, "utf8"), /공식 출처 부족/u);
  assert.match(readFileSync(inbox, "utf8"), /status: failed/u);
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(job.id)!.status, "failed");
});

test("NAVER Blog draft requires 3 to 10 tags", (t) => {
  const db = openDatabase(":memory:");
  const job = createJob(db, "digital-life", "Windows PC 백업", "2026-08-07");
  transitionJob(db, job.id, "selected");
  transitionJob(db, job.id, "inbox");
  const vault = mkdtempSync(join(tmpdir(), "auto-ad-tags-"));
  t.after(() => { db.close(); rmSync(vault, { recursive: true, force: true }); });
  mkdirSync(join(vault, "00-inbox"));
  const inbox = join(vault, "00-inbox", "job.md");
  writeFileSync(inbox, source(job.id));

  assert.throws(() => finalizeDraft(db, vault, inbox, draft(job.id).replace("#윈도우 #PC백업 #원드라이브", "#윈도우 #백업")), /3 to 10/u);
});
