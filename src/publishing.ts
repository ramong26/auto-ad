import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { createSlug, isTelegramOwner } from "./core.ts";
import {
  beginPublication,
  claimPublicationDecision,
  completePublication,
  getJob,
  getPublication,
  invalidatePublicationReview,
  recordJobFailure,
  recordWordPressDraft,
  transitionJob,
  type Publication,
} from "./database.ts";
import { frontMatter } from "./drafting.ts";
import { callTelegram, type TelegramCallback } from "./topic-flow.ts";

export interface WordPressConfig {
  baseUrl: string;
  username: string;
  applicationPassword: string;
  categoryId: number;
  timeoutMs?: number;
}

export interface WordPressPost {
  id: number;
  slug: string;
  status: "publish" | "draft" | "pending" | "private" | "future";
  link: string;
  date_gmt?: string;
  title?: { raw?: string };
  excerpt?: { raw?: string };
  content?: { raw?: string };
}

export class WordPressAuthError extends Error {
  override name = "WordPressAuthError";
}

function configUrl(config: WordPressConfig): URL {
  const url = new URL(config.baseUrl);
  if (url.protocol !== "https:") throw new Error("WordPress URL must use HTTPS");
  if (!config.username.trim() || !config.applicationPassword.trim()) throw new Error("WordPress credentials are required");
  if (!Number.isInteger(config.categoryId) || config.categoryId < 1) throw new Error("WordPress category ID is required");
  return new URL(url.origin);
}

function headers(config: WordPressConfig): Headers {
  return new Headers({
    authorization: `Basic ${Buffer.from(`${config.username}:${config.applicationPassword}`).toString("base64")}`,
  });
}

async function wpJson<T>(
  config: WordPressConfig,
  path: string,
  init: RequestInit,
  request: typeof fetch,
): Promise<T> {
  const url = new URL(`/wp-json/wp/v2/${path}`, configUrl(config));
  const requestHeaders = headers(config);
  for (const [key, value] of new Headers(init.headers)) requestHeaders.set(key, value);
  const response = await request(url, {
    ...init,
    headers: requestHeaders,
    signal: init.signal ?? AbortSignal.timeout(config.timeoutMs ?? 15_000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new WordPressAuthError(`WordPress authentication failed (${response.status})`);
  }
  if (!response.ok) throw new Error(`WordPress REST request failed (${response.status})`);
  try {
    return await response.json() as T;
  } catch {
    throw new Error("WordPress REST returned invalid JSON");
  }
}

export async function findPostBySlug(
  config: WordPressConfig,
  slug: string,
  request: typeof fetch = fetch,
): Promise<WordPressPost | undefined> {
  const query = new URLSearchParams({
    slug,
    context: "edit",
    status: "publish,draft,pending,private,future",
    per_page: "1",
  });
  return (await wpJson<WordPressPost[]>(config, `posts?${query}`, { method: "GET" }, request))[0];
}

export async function verifyWordPressSetup(
  config: WordPressConfig,
  request: typeof fetch = fetch,
): Promise<{ user: string; category: string }> {
  const user = await wpJson<{ name: string; roles: string[] }>(config, "users/me?context=edit", { method: "GET" }, request);
  if (user.roles.length !== 1 || user.roles[0] !== "author") {
    throw new Error("WordPress automation user must have only the Author role");
  }
  const category = await wpJson<{ id: number; name: string }>(
    config,
    `categories/${config.categoryId}?context=edit`,
    { method: "GET" },
    request,
  );
  await findPostBySlug(config, `auto-ad-connection-check-${Date.now()}`, request);
  return { user: user.name, category: category.name };
}

function draftParts(markdown: string): { metadata: Record<string, string>; html: string } {
  const metadata = frontMatter(markdown);
  const html = /^## WordPress HTML\s*\r?\n([\s\S]*?)(?=\r?\n## |$)/mu.exec(markdown)?.[1]?.trim();
  if (metadata.status !== "review" || !metadata.title || !metadata.summary || !html) {
    throw new Error("review draft title, summary, and WordPress HTML are required");
  }
  return { metadata, html };
}

function isExpectedDraft(
  post: WordPressPost,
  slug: string,
  title: string,
  summary: string,
  html: string,
): boolean {
  return post.status === "draft" && post.slug === slug && post.title?.raw === title
    && post.excerpt?.raw === summary && post.content?.raw === html;
}

function editUrl(config: WordPressConfig, postId: number): string {
  return new URL(`/wp-admin/post.php?post=${postId}&action=edit`, configUrl(config)).toString();
}

export async function stageWordPressDraft(
  db: DatabaseSync,
  jobId: number,
  draftMarkdown: string,
  config: WordPressConfig,
  request: typeof fetch = fetch,
): Promise<Publication> {
  const job = getJob(db, jobId);
  if (!job || job.status !== "review") throw new Error("only review jobs can create a WordPress draft");
  const { metadata, html } = draftParts(draftMarkdown);
  if (!metadata.id?.endsWith(`-${jobId}`) || metadata.blog !== job.blog || metadata.keyword !== job.keyword) {
    throw new Error("draft does not match its job");
  }
  let publication = getPublication(db, jobId);
  if (publication?.status === "published") return publication;
  const reviewToken = createHash("sha256").update(draftMarkdown).digest("hex").slice(0, 12);
  const slug = publication?.idempotency_key.split("/").at(-1) ?? createSlug(metadata.title!);
  const key = publication?.idempotency_key ?? `${job.blog}/${job.runDate}/${slug}`;

  if (publication?.status === "draft" && publication.wordpress_post_id) {
    invalidatePublicationReview(db, jobId);
    try {
      const post = await wpJson<WordPressPost>(config, `posts/${publication.wordpress_post_id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "draft", slug, title: metadata.title, excerpt: metadata.summary,
          content: html, categories: [config.categoryId],
        }),
      }, request);
      if (post.status !== "draft") throw new Error("WordPress did not keep the revision private");
      return recordWordPressDraft(db, key, post.id, editUrl(config, post.id), reviewToken);
    } catch (error) {
      if (error instanceof WordPressAuthError) throw error;
      const recovered = await findPostBySlug(config, slug, request);
      if (!recovered || !isExpectedDraft(recovered, slug, metadata.title!, metadata.summary!, html)) throw error;
      return recordWordPressDraft(db, key, recovered.id, editUrl(config, recovered.id), reviewToken);
    }
  }

  const found = await findPostBySlug(config, slug, request);
  if (found) {
    if (!publication || !isExpectedDraft(found, slug, metadata.title!, metadata.summary!, html)) {
      throw new Error(`WordPress slug already exists: ${slug}`);
    }
    return recordWordPressDraft(db, publication.idempotency_key, found.id, editUrl(config, found.id), reviewToken);
  }
  publication ??= beginPublication(db, jobId, key);

  try {
    const post = await wpJson<WordPressPost>(config, "posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "draft",
        slug,
        title: metadata.title,
        excerpt: metadata.summary,
        content: html,
        categories: [config.categoryId],
      }),
    }, request);
    if (post.status !== "draft") throw new Error("WordPress did not create a private draft");
    return recordWordPressDraft(db, key, post.id, editUrl(config, post.id), reviewToken);
  } catch (error) {
    if (error instanceof WordPressAuthError) throw error;
    const recovered = await findPostBySlug(config, slug, request);
    if (!recovered || !isExpectedDraft(recovered, slug, metadata.title!, metadata.summary!, html)) throw error;
    return recordWordPressDraft(db, key, recovered.id, editUrl(config, recovered.id), reviewToken);
  }
}

export async function uploadMedia(
  config: WordPressConfig,
  filename: string,
  mimeType: string,
  data: Uint8Array,
  request: typeof fetch = fetch,
): Promise<{ id: number; source_url: string }> {
  if (!filename || /[\r\n"/\\]/u.test(filename) || !mimeType.trim() || data.byteLength === 0) {
    throw new Error("safe filename, MIME type, and media bytes are required");
  }
  return wpJson(config, "media", {
    method: "POST",
    headers: { "content-type": mimeType, "content-disposition": `attachment; filename="${filename}"` },
    body: data as BodyInit,
  }, request);
}

export async function sendDraftReview(
  token: string,
  ownerId: string,
  jobId: number,
  title: string,
  draftUrl: string,
  reviewToken: string,
  request: typeof fetch = fetch,
): Promise<number> {
  if (!ownerId.trim() || !/^[a-f0-9]{12}$/u.test(reviewToken)) throw new Error("Telegram owner ID and review token are required");
  const message = await callTelegram<{ message_id: number }>(token, "sendMessage", {
    chat_id: ownerId.trim(),
    text: `[초안 검토]\n\n제목: ${title}\n초안: ${draftUrl}`,
    reply_markup: { inline_keyboard: [[
      { text: "발행 승인", callback_data: `publish:approve:${jobId}:${reviewToken}` },
      { text: "수정 요청", callback_data: `publish:revise:${jobId}:${reviewToken}` },
      { text: "폐기", callback_data: `publish:discard:${jobId}:${reviewToken}` },
    ]] },
  }, request);
  return message.message_id;
}

async function publishApproved(
  db: DatabaseSync,
  jobId: number,
  config: WordPressConfig,
  request: typeof fetch,
): Promise<{ publication: Publication; publishedAt: string }> {
  let job = getJob(db, jobId);
  const publication = getPublication(db, jobId);
  if (!job || !publication?.wordpress_post_id) throw new Error("staged WordPress draft not found");
  if (job.status === "published" && publication.status === "published") {
    return { publication, publishedAt: new Date().toISOString() };
  }
  if (job.status === "approved") job = transitionJob(db, jobId, "publishing");
  if (job.status !== "publishing") throw new Error("publication requires explicit approval");
  const slug = publication.idempotency_key.split("/").at(-1)!;
  let post: WordPressPost;
  try {
    post = await wpJson(config, `posts/${publication.wordpress_post_id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "publish" }),
    }, request);
  } catch (error) {
    if (error instanceof WordPressAuthError) {
      transitionJob(db, jobId, "approved");
      throw error;
    }
    const recovered = await findPostBySlug(config, slug, request);
    if (!recovered || recovered.id !== publication.wordpress_post_id || recovered.status !== "publish") {
      transitionJob(db, jobId, "approved");
      throw error;
    }
    post = recovered;
  }
  if (post.status !== "publish" || !post.link) {
    transitionJob(db, jobId, "approved");
    throw new Error("WordPress post was not published");
  }
  const publishedAt = post.date_gmt ? `${post.date_gmt.replace(/Z$/u, "")}Z` : new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const completed = completePublication(db, publication.idempotency_key, post.id, post.link);
    transitionJob(db, jobId, "published");
    db.exec("COMMIT");
    return { publication: completed, publishedAt };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function withStatus(markdown: string, status: string, fields: Record<string, string> = {}): string {
  let result = markdown.replace(/^status:\s*\w+\s*$/mu, `status: ${status}`);
  const additions = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n");
  if (additions) result = result.replace(/\r?\n---(?:\r?\n)/u, `\n${additions}\n---\n`);
  return result;
}

function findDraft(vaultPath: string, jobId: number): string {
  for (const folder of ["20-drafts", "40-published"]) {
    const directory = resolve(vaultPath, folder);
    if (!existsSync(directory)) continue;
    const name = readdirSync(directory).find((file) => file.endsWith(`-${jobId}.md`));
    if (name) return resolve(directory, name);
  }
  throw new Error(`draft for job ${jobId} not found`);
}

function updateSource(vaultPath: string, draftPath: string, status: string, fields: Record<string, string> = {}): void {
  const source = resolve(vaultPath, "00-inbox", basename(draftPath));
  if (existsSync(source)) writeFileSync(source, withStatus(readFileSync(source, "utf8"), status, fields), "utf8");
}

function recordPublished(vaultPath: string, draftPath: string, url: string, publishedAt: string): string {
  const output = resolve(vaultPath, "40-published", basename(draftPath));
  mkdirSync(dirname(output), { recursive: true });
  const fields = { wordpressUrl: url, publishedAt };
  if (!existsSync(output)) writeFileSync(output, withStatus(readFileSync(draftPath, "utf8"), "published", fields), { flag: "wx" });
  updateSource(vaultPath, draftPath, "published", fields);
  if (resolve(draftPath) !== output && existsSync(draftPath)) unlinkSync(draftPath);
  return output;
}

export async function handlePublicationCallback(
  db: DatabaseSync,
  callback: TelegramCallback,
  ownerId: string,
  vaultPath: string,
  config: WordPressConfig,
  request: typeof fetch = fetch,
): Promise<string> {
  if (!isTelegramOwner(callback.from.id, ownerId)) throw new Error("Telegram user is not allowed");
  const match = /^publish:(approve|revise|discard):(\d+):([a-f0-9]{12})$/u.exec(callback.data ?? "");
  if (!match) throw new Error("invalid publication callback");
  const decision = match[1] as "approve" | "revise" | "discard";
  const jobId = Number(match[2]);
  const publication = getPublication(db, jobId);
  if (!publication?.review_token || publication.review_token !== match[3]) throw new Error("stale publication callback");
  claimPublicationDecision(db, jobId, String(callback.from.id), decision);
  let job = getJob(db, jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  const draftPath = findDraft(vaultPath, jobId);

  if (decision === "revise") {
    if (job.status === "review") transitionJob(db, jobId, "revision_requested");
    updateSource(vaultPath, draftPath, "revision_requested");
    return "수정 요청으로 돌렸습니다.";
  }
  if (decision === "discard") {
    if (job.status === "review") recordJobFailure(db, jobId, "Telegram owner discarded the draft");
    updateSource(vaultPath, draftPath, "failed");
    writeFileSync(draftPath, withStatus(readFileSync(draftPath, "utf8"), "failed"), "utf8");
    return "초안을 폐기했습니다.";
  }

  if (job.status === "review") job = transitionJob(db, jobId, "approved");
  const result = await publishApproved(db, jobId, config, request);
  recordPublished(vaultPath, draftPath, result.publication.wordpress_url!, result.publishedAt);
  return `발행 완료: ${result.publication.wordpress_url}`;
}
