import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createJob, getPublication, openDatabase, transitionJob } from "./database.ts";
import {
  handlePublicationCallback,
  sendDraftReview,
  stageWordPressDraft,
  uploadMedia,
  verifyWordPressSetup,
  WordPressAuthError,
  type WordPressConfig,
} from "./publishing.ts";

const config: WordPressConfig = {
  baseUrl: "https://blog.example.com",
  username: "publisher",
  applicationPassword: "app password",
  categoryId: 7,
};

function markdown(id: number): string {
  return `---
id: "2026-08-07-windows-backup-${id}"
status: review
blog: "digital-life"
keyword: "Windows PC 백업"
title: "Windows PC 백업 확인법"
summary: "백업 상태를 확인합니다."
metaDescription: "백업 확인 체크리스트"
---

## WordPress HTML
<article><p>백업 상태를 확인합니다.</p></article>

## 체크리스트
- 파일을 연다.

## 출처
- [Microsoft](https://support.microsoft.com/)
`;
}

function reviewJob() {
  const db = openDatabase(":memory:");
  const job = createJob(db, "digital-life", "Windows PC 백업", "2026-08-07");
  for (const status of ["selected", "inbox", "drafting", "review"] as const) transitionJob(db, job.id, status);
  return { db, job };
}

function vault(jobId: number): string {
  const path = mkdtempSync(join(tmpdir(), "auto-ad-publish-"));
  for (const folder of ["00-inbox", "20-drafts"]) mkdirSync(join(path, folder));
  writeFileSync(join(path, "00-inbox", `2026-08-07-windows-backup-${jobId}.md`), markdown(jobId));
  writeFileSync(join(path, "20-drafts", `2026-08-07-windows-backup-${jobId}.md`), markdown(jobId));
  return path;
}

test("only owner approval publishes once and records URL in SQLite and Vault", async (t) => {
  const { db, job } = reviewJob();
  const vaultPath = vault(job.id);
  t.after(() => { db.close(); rmSync(vaultPath, { recursive: true, force: true }); });
  const calls: Array<{ url: string; method: string; body: string }> = [];
  const wp = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = String(init?.body ?? "");
    calls.push({ url, method, body });
    assert.match(new Headers(init?.headers).get("authorization") ?? "", /^Basic /u);
    if (method === "GET") return Response.json([]);
    if (url.endsWith("/posts")) {
      assert.deepEqual(JSON.parse(body), {
        status: "draft",
        slug: "windows-pc-백업-확인법",
        title: "Windows PC 백업 확인법",
        excerpt: "백업 상태를 확인합니다.",
        content: "<article><p>백업 상태를 확인합니다.</p></article>",
        categories: [7],
      });
      return Response.json({ id: 42, slug: "windows-pc-백업-확인법", status: "draft", link: "https://blog.example.com/?p=42" });
    }
    assert.deepEqual(JSON.parse(body), { status: "publish" });
    return Response.json({
      id: 42,
      slug: "windows-pc-백업-확인법",
      status: "publish",
      link: "https://blog.example.com/windows-pc-backup/",
      date_gmt: "2026-08-07T01:00:00",
    });
  }) as typeof fetch;

  const staged = await stageWordPressDraft(db, job.id, markdown(job.id), config, wp);
  assert.equal(staged.status, "draft");
  assert.equal(staged.wordpress_url, "https://blog.example.com/wp-admin/post.php?post=42&action=edit");
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(job.id)!.status, "review");
  assert.equal(calls.filter(({ body }) => body.includes('"status":"publish"')).length, 0);

  await assert.rejects(
    handlePublicationCallback(db, { id: "x", from: { id: 999 }, data: `publish:approve:${job.id}:${staged.review_token}` }, "123", vaultPath, config, wp),
    /not allowed/u,
  );
  assert.equal(calls.filter(({ body }) => body.includes('"status":"publish"')).length, 0);

  const result = await handlePublicationCallback(
    db,
    { id: "ok", from: { id: 123 }, data: `publish:approve:${job.id}:${staged.review_token}` },
    "123",
    vaultPath,
    config,
    wp,
  );
  assert.equal(result, "발행 완료: https://blog.example.com/windows-pc-backup/");
  assert.equal(db.prepare("SELECT status FROM jobs WHERE id = ?").get(job.id)!.status, "published");
  assert.equal(getPublication(db, job.id)!.status, "published");
  assert.equal(calls.filter(({ body }) => body.includes('"status":"publish"')).length, 1);
  const published = join(vaultPath, "40-published", `2026-08-07-windows-backup-${job.id}.md`);
  assert.equal(existsSync(published), true);
  assert.match(readFileSync(published, "utf8"), /status: published[\s\S]*wordpressUrl: "https:\/\/blog\.example\.com/u);
  assert.match(readFileSync(join(vaultPath, "00-inbox", `2026-08-07-windows-backup-${job.id}.md`), "utf8"), /status: published/u);
  assert.equal(existsSync(join(vaultPath, "20-drafts", `2026-08-07-windows-backup-${job.id}.md`)), false);

  await handlePublicationCallback(
    db,
    { id: "repeat", from: { id: 123 }, data: `publish:approve:${job.id}:${staged.review_token}` },
    "123",
    vaultPath,
    config,
    wp,
  );
  assert.equal(calls.filter(({ body }) => body.includes('"status":"publish"')).length, 1);
});

test("Telegram review has link and three owner decisions; media uses REST upload", async () => {
  const payloads: Array<Record<string, unknown>> = [];
  const telegram = (async (_input: string | URL | Request, init?: RequestInit) => {
    payloads.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json({ ok: true, result: { message_id: 9 } });
  }) as typeof fetch;
  assert.equal(await sendDraftReview(
    "token", "123", 7, "제목", "https://blog.example.com/wp-admin/post.php?post=42", "abcdef123456", telegram,
  ), 9);
  assert.match(String(payloads[0]!.text), /https:\/\/blog\.example\.com/u);
  const buttons = (payloads[0]!.reply_markup as { inline_keyboard: Array<Array<{ text: string }>> }).inline_keyboard[0]!
    .map(({ text }) => text);
  assert.deepEqual(buttons, ["발행 승인", "수정 요청", "폐기"]);

  const mediaRequest = (async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(input), "https://blog.example.com/wp-json/wp/v2/media");
    assert.equal(new Headers(init?.headers).get("content-type"), "image/png");
    assert.equal(new Headers(init?.headers).get("content-disposition"), 'attachment; filename="cover.png"');
    return Response.json({ id: 3, source_url: "https://blog.example.com/cover.png" });
  }) as typeof fetch;
  assert.equal((await uploadMedia(config, "cover.png", "image/png", new Uint8Array([1]), mediaRequest)).id, 3);
});

test("publish timeout recovers by slug; authentication failure stops immediately", async (t) => {
  const timeoutCase = reviewJob();
  const timeoutVault = vault(timeoutCase.job.id);
  t.after(() => { timeoutCase.db.close(); rmSync(timeoutVault, { recursive: true, force: true }); });
  let stage = true;
  const recover = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET") {
      if (stage) return Response.json([]);
      return Response.json([{ id: 42, slug: "windows-pc-백업-확인법", status: "publish", link: "https://blog.example.com/recovered/" }]);
    }
    if (url.endsWith("/posts")) return Response.json({ id: 42, slug: "windows-pc-백업-확인법", status: "draft", link: "x" });
    stage = false;
    throw new DOMException("timeout", "TimeoutError");
  }) as typeof fetch;
  const timeoutStaged = await stageWordPressDraft(timeoutCase.db, timeoutCase.job.id, markdown(timeoutCase.job.id), config, recover);
  stage = false;
  assert.match(await handlePublicationCallback(
    timeoutCase.db,
    { id: "timeout", from: { id: 123 }, data: `publish:approve:${timeoutCase.job.id}:${timeoutStaged.review_token}` },
    "123",
    timeoutVault,
    config,
    recover,
  ), /recovered/u);
  assert.equal(timeoutCase.db.prepare("SELECT count(*) AS count FROM publications").get()!.count, 1);

  const authCase = reviewJob();
  const authVault = vault(authCase.job.id);
  t.after(() => { authCase.db.close(); rmSync(authVault, { recursive: true, force: true }); });
  let publishCalls = 0;
  const auth = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if ((init?.method ?? "GET") === "GET") return Response.json([]);
    if (url.endsWith("/posts")) return Response.json({ id: 51, slug: "windows-pc-백업-확인법", status: "draft", link: "x" });
    publishCalls += 1;
    return Response.json({ code: "rest_cannot_create" }, { status: 401 });
  }) as typeof fetch;
  const authStaged = await stageWordPressDraft(authCase.db, authCase.job.id, markdown(authCase.job.id), config, auth);
  await assert.rejects(
    handlePublicationCallback(
      authCase.db,
      { id: "auth", from: { id: 123 }, data: `publish:approve:${authCase.job.id}:${authStaged.review_token}` },
      "123",
      authVault,
      config,
      auth,
    ),
    WordPressAuthError,
  );
  assert.equal(publishCalls, 1);
  assert.equal(authCase.db.prepare("SELECT status FROM jobs WHERE id = ?").get(authCase.job.id)!.status, "approved");
  assert.equal(getPublication(authCase.db, authCase.job.id)!.status, "draft");
});

test("WordPress refuses non-HTTPS configuration", async () => {
  const { db, job } = reviewJob();
  await assert.rejects(
    stageWordPressDraft(db, job.id, markdown(job.id), { ...config, baseUrl: "http://blog.example.com" }, async () => {
      throw new Error("must not request");
    }),
    /must use HTTPS/u,
  );
  db.close();
});

test("WordPress setup verifies least-privilege author and category", async () => {
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("/users/me")) return Response.json({ name: "auto-ad", roles: ["author"] });
    if (url.includes("/categories/7")) return Response.json({ id: 7, name: "디지털 생활" });
    return Response.json([]);
  }) as typeof fetch;
  assert.deepEqual(await verifyWordPressSetup(config, request), { user: "auto-ad", category: "디지털 생활" });
  await assert.rejects(
    verifyWordPressSetup(config, (async (input: string | URL | Request) => {
      if (String(input).includes("/users/me")) return Response.json({ name: "admin", roles: ["administrator"] });
      return Response.json({});
    }) as typeof fetch),
    /only the Author role/u,
  );
});

test("draft timeout only adopts a slug whose content matches", async () => {
  for (const matches of [true, false]) {
    const { db, job } = reviewJob();
    let reads = 0;
    const request = (async (_input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") throw new DOMException("timeout", "TimeoutError");
      reads += 1;
      if (reads === 1) return Response.json([]);
      return Response.json([{
        id: 42,
        slug: "windows-pc-백업-확인법",
        status: "draft",
        link: "x",
        title: { raw: "Windows PC 백업 확인법" },
        excerpt: { raw: "백업 상태를 확인합니다." },
        content: { raw: matches ? "<article><p>백업 상태를 확인합니다.</p></article>" : "다른 글" },
      }]);
    }) as typeof fetch;
    if (matches) assert.equal((await stageWordPressDraft(db, job.id, markdown(job.id), config, request)).wordpress_post_id, 42);
    else await assert.rejects(stageWordPressDraft(db, job.id, markdown(job.id), config, request), /timeout/u);
    db.close();
  }
});

test("duplicate slug is blocked and stale approval cannot publish a revision", async (t) => {
  const { db, job } = reviewJob();
  const vaultPath = vault(job.id);
  t.after(() => { db.close(); rmSync(vaultPath, { recursive: true, force: true }); });
  let writes = 0;
  const duplicate = (async (_input: string | URL | Request, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") writes += 1;
    return Response.json([{ id: 99, slug: "windows-pc-백업-확인법", status: "publish", link: "https://blog.example.com/existing/" }]);
  }) as typeof fetch;
  await assert.rejects(stageWordPressDraft(db, job.id, markdown(job.id), config, duplicate), /slug already exists/u);
  assert.equal(writes, 0);

  assert.equal(writes, 0);

  const revision = reviewJob();
  const revisionVault = vault(revision.job.id);
  t.after(() => { revision.db.close(); rmSync(revisionVault, { recursive: true, force: true }); });
  const privateDraft = (async (input: string | URL | Request, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return Response.json([]);
    return Response.json({ id: 42, slug: "windows-pc-백업-확인법", status: "draft", link: String(input) });
  }) as typeof fetch;
  const first = await stageWordPressDraft(revision.db, revision.job.id, markdown(revision.job.id), config, privateDraft);
  const oldApproval = `publish:approve:${revision.job.id}:${first.review_token}`;
  assert.equal(await handlePublicationCallback(
    revision.db,
    { id: "revise", from: { id: 123 }, data: `publish:revise:${revision.job.id}:${first.review_token}` },
    "123",
    revisionVault,
    config,
    privateDraft,
  ), "수정 요청으로 돌렸습니다.");
  for (const status of ["inbox", "drafting", "review"] as const) transitionJob(revision.db, revision.job.id, status);
  const second = await stageWordPressDraft(
    revision.db,
    revision.job.id,
    markdown(revision.job.id).replace("백업 상태를 확인합니다.", "수정한 백업 절차입니다."),
    config,
    privateDraft,
  );
  assert.notEqual(second.review_token, first.review_token);
  await assert.rejects(handlePublicationCallback(
    revision.db,
    { id: "stale", from: { id: 123 }, data: oldApproval },
    "123",
    revisionVault,
    config,
    privateDraft,
  ), /stale publication callback/u);
  assert.equal(revision.db.prepare("SELECT status FROM jobs WHERE id = ?").get(revision.job.id)!.status, "review");
});
