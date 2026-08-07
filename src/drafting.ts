import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { createSlug } from "./core.ts";
import { getJob, hasRecentKeyword, transitionJob } from "./database.ts";

const eligibleStatuses = new Set(["inbox", "revision_requested"]);

function frontMatter(markdown: string): Record<string, string> {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown)?.[1];
  if (!block) throw new Error("Markdown front matter is required");
  return Object.fromEntries(block.split(/\r?\n/u).flatMap((line) => {
    const match = /^([A-Za-z][\w]*):\s*(.*)$/u.exec(line);
    if (!match) return [];
    let value = match[2]!.trim();
    if (value.startsWith('"')) {
      try { value = JSON.parse(value) as string; } catch { throw new Error(`invalid front matter: ${match[1]}`); }
    }
    return [[match[1]!, value]];
  }));
}

function sourcePath(vaultPath: string, path: string): string {
  const inbox = resolve(vaultPath, "00-inbox");
  const fullPath = resolve(path);
  const child = relative(inbox, fullPath);
  if (!child || child.startsWith("..") || resolve(inbox, child) !== fullPath || !fullPath.endsWith(".md")) {
    throw new Error("source must be a Markdown file in vault/00-inbox");
  }
  return fullPath;
}

function replaceStatus(markdown: string, status: "review" | "failed"): string {
  if (!/^status:\s*(inbox|revision_requested)\s*$/mu.test(markdown)) {
    throw new Error("source status must be inbox or revision_requested");
  }
  return markdown.replace(/^status:\s*(inbox|revision_requested)\s*$/mu, `status: ${status}`);
}

function jobId(metadata: Record<string, string>): number {
  const match = /-(\d+)$/u.exec(metadata.id ?? "");
  if (!match) throw new Error("source id must end with the numeric job ID");
  return Number(match[1]);
}

export function validateDraft(sourceMarkdown: string, draftMarkdown: string): void {
  const source = frontMatter(sourceMarkdown);
  const draft = frontMatter(draftMarkdown);
  if (!eligibleStatuses.has(source.status ?? "")) throw new Error("source status is not eligible");
  for (const field of ["id", "blog", "keyword"] as const) {
    if (!source[field] || draft[field] !== source[field]) throw new Error(`draft ${field} must match source`);
  }
  for (const field of ["title", "summary", "metaDescription"] as const) {
    if (!draft[field]?.trim()) throw new Error(`draft ${field} is required`);
  }
  if (draft.status !== "review") throw new Error("draft status must be review");
  if (!/^## WordPress HTML\s*$/mu.test(draftMarkdown) || !/<article[\s>]/u.test(draftMarkdown)) {
    throw new Error("WordPress HTML article is required");
  }
  const sources = [...draftMarkdown.matchAll(/https:\/\/[^\s)>"']+/gu)].map(([url]) => url);
  if (!/^## 출처\s*$/mu.test(draftMarkdown) || sources.length === 0) throw new Error("source URLs are required");
  if (!/^## (직접 확인|비교|체크리스트)\s*$/mu.test(draftMarkdown)) {
    throw new Error("direct check, comparison, or checklist is required");
  }
}

function moveJobToReview(db: DatabaseSync, id: number, metadata: Record<string, string>): void {
  let job = getJob(db, id);
  if (!job) throw new Error(`job ${id} not found`);
  if (job.blog !== metadata.blog || job.keyword !== metadata.keyword) throw new Error("source does not match its job");
  if (hasRecentKeyword(db, job.blog, job.keyword, job.runDate, job.id)) {
    throw new Error("duplicate topic within 90 days");
  }
  if (job.status === "revision_requested") job = transitionJob(db, id, "inbox");
  if (job.status === "inbox") job = transitionJob(db, id, "drafting");
  if (job.status === "drafting") job = transitionJob(db, id, "review");
  if (job.status !== "review") throw new Error(`job ${id} cannot be drafted from ${job.status}`);
}

export function finalizeDraft(
  db: DatabaseSync,
  vaultPath: string,
  inboxPath: string,
  draftMarkdown: string,
): string {
  const inputPath = sourcePath(vaultPath, inboxPath);
  const sourceMarkdown = readFileSync(inputPath, "utf8");
  validateDraft(sourceMarkdown, draftMarkdown);
  const metadata = frontMatter(sourceMarkdown);
  const outputPath = resolve(vaultPath, "20-drafts", `${createSlug(metadata.id!)}.md`);
  if (existsSync(outputPath)) throw new Error(`duplicate draft: ${basename(outputPath)}`);
  mkdirSync(dirname(outputPath), { recursive: true });

  db.exec("BEGIN IMMEDIATE");
  let wroteDraft = false;
  try {
    moveJobToReview(db, jobId(metadata), metadata);
    writeFileSync(outputPath, draftMarkdown, { encoding: "utf8", flag: "wx" });
    wroteDraft = true;
    writeFileSync(inputPath, replaceStatus(sourceMarkdown, "review"), "utf8");
    db.exec("COMMIT");
    return outputPath;
  } catch (error) {
    db.exec("ROLLBACK");
    if (wroteDraft) unlinkSync(outputPath);
    writeFileSync(inputPath, sourceMarkdown, "utf8");
    throw error;
  }
}

export function failDraft(
  db: DatabaseSync,
  vaultPath: string,
  inboxPath: string,
  reason: string,
  createdAt = new Date().toISOString(),
): string {
  if (!reason.trim()) throw new Error("failure reason is required");
  const inputPath = sourcePath(vaultPath, inboxPath);
  const sourceMarkdown = readFileSync(inputPath, "utf8");
  const metadata = frontMatter(sourceMarkdown);
  if (!eligibleStatuses.has(metadata.status ?? "")) throw new Error("source status is not eligible");
  const outputPath = resolve(vaultPath, "90-failed", `${createSlug(metadata.id!)}.md`);
  if (existsSync(outputPath)) throw new Error(`duplicate failure: ${basename(outputPath)}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  const record = [
    "---", `id: ${JSON.stringify(metadata.id)}`, "status: failed",
    `blog: ${JSON.stringify(metadata.blog)}`, `keyword: ${JSON.stringify(metadata.keyword)}`,
    `createdAt: ${JSON.stringify(createdAt)}`, "---", "", "# 초안 작성 실패", "",
    `- 사유: ${reason.trim()}`, `- 원본: ${relative(dirname(outputPath), inputPath).replaceAll("\\", "/")}`, "",
  ].join("\n");

  db.exec("BEGIN IMMEDIATE");
  let wroteFailure = false;
  try {
    const id = jobId(metadata);
    const job = getJob(db, id);
    if (!job) throw new Error(`job ${id} not found`);
    if (job.blog !== metadata.blog || job.keyword !== metadata.keyword) throw new Error("source does not match its job");
    transitionJob(db, id, "failed");
    writeFileSync(outputPath, record, { encoding: "utf8", flag: "wx" });
    wroteFailure = true;
    writeFileSync(inputPath, replaceStatus(sourceMarkdown, "failed"), "utf8");
    db.exec("COMMIT");
    return outputPath;
  } catch (error) {
    db.exec("ROLLBACK");
    if (wroteFailure) unlinkSync(outputPath);
    writeFileSync(inputPath, sourceMarkdown, "utf8");
    throw error;
  }
}
