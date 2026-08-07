import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { canTransition, normalizeKeyword, type JobStatus } from "./core.ts";

export interface Job {
  id: number;
  blog: string;
  keyword: string;
  normalizedKeyword: string;
  runDate: string;
  status: JobStatus;
}

interface JobRow {
  id: number;
  blog: string;
  keyword: string;
  normalized_keyword: string;
  run_date: string;
  status: JobStatus;
}

export interface Publication {
  id: number;
  job_id: number;
  idempotency_key: string;
  status: "pending" | "draft" | "published";
  wordpress_post_id: number | null;
  wordpress_url: string | null;
  review_token: string | null;
}

export interface PublicationDecision {
  jobId: number;
  telegramUserId: string;
  decision: "approve" | "revise" | "discard";
}

export interface TrendCacheRow {
  payload: string;
  fetchedAt: number;
}

export interface ApprovalRow {
  jobId: number;
  telegramUserId: string;
  action: string;
  status: "processing" | "completed";
  inboxPath: string | null;
}

export interface TopicDetails {
  jobId: number;
  growth: number;
  score: number;
  conceptFit: number;
  risk: "low" | "medium";
}

export function openDatabase(path = process.env.DATABASE_PATH ?? "./data/app.db"): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      blog TEXT NOT NULL,
      keyword TEXT NOT NULL,
      normalized_keyword TEXT NOT NULL,
      run_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'candidate',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (normalized_keyword, run_date, blog)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS publications (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      idempotency_key TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'pending',
      wordpress_post_id INTEGER UNIQUE,
      wordpress_url TEXT,
      review_token TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT
    ) STRICT;

    CREATE UNIQUE INDEX IF NOT EXISTS publications_job_id_unique ON publications(job_id);

    CREATE TABLE IF NOT EXISTS publication_decisions (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id),
      telegram_user_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      decided_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE IF NOT EXISTS trend_cache (
      cache_key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at INTEGER NOT NULL
    ) STRICT;

    CREATE TABLE IF NOT EXISTS job_failures (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT;

    CREATE TABLE IF NOT EXISTS publish_attempts (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id),
      attempt INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('success', 'failure')),
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (job_id, attempt)
    ) STRICT;

    CREATE TABLE IF NOT EXISTS approvals (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id),
      telegram_user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      inbox_path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TEXT
    ) STRICT;

    CREATE TABLE IF NOT EXISTS topic_details (
      job_id INTEGER PRIMARY KEY REFERENCES jobs(id),
      growth REAL NOT NULL,
      score REAL NOT NULL,
      concept_fit REAL NOT NULL,
      risk TEXT NOT NULL
    ) STRICT;
  `);
  const publicationColumns = db.prepare("PRAGMA table_info(publications)").all() as unknown as Array<{ name: string }>;
  if (!publicationColumns.some(({ name }) => name === "review_token")) {
    db.exec("ALTER TABLE publications ADD COLUMN review_token TEXT");
  }
  return db;
}

export function getJob(db: DatabaseSync, jobId: number): Job | undefined {
  const row = db.prepare(`
    SELECT id, blog, keyword, normalized_keyword, run_date, status FROM jobs WHERE id = ?
  `).get(jobId) as unknown as JobRow | undefined;
  return row ? mapJob(row) : undefined;
}

export function hasRecentKeyword(
  db: DatabaseSync,
  blog: string,
  keyword: string,
  runDate: string,
  excludeJobId: number,
): boolean {
  const row = db.prepare(`
    SELECT 1 FROM jobs
    WHERE blog = ? AND normalized_keyword = ? AND run_date < ?
      AND run_date >= date(?, '-90 days') AND status != 'failed' AND id != ?
    LIMIT 1
  `).get(blog, normalizeKeyword(keyword), runDate, runDate, excludeJobId);
  return row !== undefined;
}

export function recordJobFailure(db: DatabaseSync, jobId: number, reason: string): void {
  const job = getJob(db, jobId);
  if (!job) throw new Error(`job ${jobId} not found`);
  if (job.status !== "failed") transitionJob(db, jobId, "failed");
  db.prepare("INSERT INTO job_failures (job_id, reason) VALUES (?, ?)").run(jobId, reason);
}

export function recordPublishAttempt(
  db: DatabaseSync,
  jobId: number,
  status: "success" | "failure",
  error?: unknown,
): void {
  db.prepare(`
    INSERT INTO publish_attempts (job_id, attempt, status, error_message)
    SELECT ?, COALESCE(MAX(attempt), 0) + 1, ?, ? FROM publish_attempts WHERE job_id = ?
  `).run(jobId, status, error === undefined ? null : error instanceof Error ? error.message : String(error), jobId);
}

export function getTrendCache(db: DatabaseSync, key: string, freshAfter: number): TrendCacheRow | undefined {
  const row = db.prepare(`
    SELECT payload, fetched_at FROM trend_cache WHERE cache_key = ? AND fetched_at >= ?
  `).get(key, freshAfter) as unknown as { payload: string; fetched_at: number } | undefined;
  return row ? { payload: row.payload, fetchedAt: row.fetched_at } : undefined;
}

export function putTrendCache(db: DatabaseSync, key: string, payload: string, fetchedAt: number): void {
  db.prepare(`
    INSERT INTO trend_cache (cache_key, payload, fetched_at) VALUES (?, ?, ?)
    ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at
  `).run(key, payload, fetchedAt);
}

export function claimApproval(
  db: DatabaseSync,
  jobId: number,
  telegramUserId: string,
  action: string,
): ApprovalRow {
  db.prepare(`
    INSERT INTO approvals (job_id, telegram_user_id, action) VALUES (?, ?, ?)
    ON CONFLICT (job_id) DO NOTHING
  `).run(jobId, telegramUserId, action);
  const row = db.prepare(`
    SELECT job_id, telegram_user_id, action, status, inbox_path FROM approvals WHERE job_id = ?
  `).get(jobId) as unknown as {
    job_id: number;
    telegram_user_id: string;
    action: string;
    status: "processing" | "completed";
    inbox_path: string | null;
  };
  if (row.telegram_user_id !== telegramUserId || row.action !== action) {
    throw new Error(`job ${jobId} already handled`);
  }
  return {
    jobId: row.job_id,
    telegramUserId: row.telegram_user_id,
    action: row.action,
    status: row.status,
    inboxPath: row.inbox_path,
  };
}

export function completeApproval(db: DatabaseSync, jobId: number, inboxPath: string | null): void {
  db.prepare(`
    UPDATE approvals SET status = 'completed', inbox_path = ?, completed_at = CURRENT_TIMESTAMP
    WHERE job_id = ?
  `).run(inboxPath, jobId);
}

export function saveTopicDetails(db: DatabaseSync, details: TopicDetails): void {
  db.prepare(`
    INSERT INTO topic_details (job_id, growth, score, concept_fit, risk) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (job_id) DO UPDATE SET
      growth = excluded.growth, score = excluded.score,
      concept_fit = excluded.concept_fit, risk = excluded.risk
  `).run(details.jobId, details.growth, details.score, details.conceptFit, details.risk);
}

export function getTopicDetails(db: DatabaseSync, jobId: number): TopicDetails | undefined {
  const row = db.prepare(`
    SELECT job_id, growth, score, concept_fit, risk FROM topic_details WHERE job_id = ?
  `).get(jobId) as unknown as {
    job_id: number;
    growth: number;
    score: number;
    concept_fit: number;
    risk: "low" | "medium";
  } | undefined;
  return row ? {
    jobId: row.job_id,
    growth: row.growth,
    score: row.score,
    conceptFit: row.concept_fit,
    risk: row.risk,
  } : undefined;
}

function mapJob(row: JobRow): Job {
  return {
    id: row.id,
    blog: row.blog,
    keyword: row.keyword,
    normalizedKeyword: row.normalized_keyword,
    runDate: row.run_date,
    status: row.status,
  };
}

export function createJob(db: DatabaseSync, blog: string, keyword: string, runDate: string): Job {
  const normalized = normalizeKeyword(keyword);
  if (!blog.trim() || !normalized || !/^\d{4}-\d{2}-\d{2}$/u.test(runDate)) {
    throw new Error("blog, keyword, and an ISO run date are required");
  }
  db.prepare(`
    INSERT INTO jobs (blog, keyword, normalized_keyword, run_date)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (normalized_keyword, run_date, blog) DO NOTHING
  `).run(blog.trim(), keyword.trim(), normalized, runDate);
  const row = db.prepare(`
    SELECT id, blog, keyword, normalized_keyword, run_date, status
    FROM jobs WHERE normalized_keyword = ? AND run_date = ? AND blog = ?
  `).get(normalized, runDate, blog.trim()) as unknown as JobRow;
  return mapJob(row);
}

export function transitionJob(db: DatabaseSync, jobId: number, to: JobStatus): Job {
  const current = db.prepare(`
    SELECT id, blog, keyword, normalized_keyword, run_date, status FROM jobs WHERE id = ?
  `).get(jobId) as unknown as JobRow | undefined;
  if (!current) throw new Error(`job ${jobId} not found`);
  if (!canTransition(current.status, to)) {
    throw new Error(`invalid job transition: ${current.status} -> ${to}`);
  }
  db.prepare("UPDATE jobs SET status = ? WHERE id = ?").run(to, jobId);
  return mapJob({ ...current, status: to });
}

export function beginPublication(db: DatabaseSync, jobId: number, idempotencyKey: string): Publication {
  if (!idempotencyKey.trim()) throw new Error("idempotency key is required");
  db.prepare(`
    INSERT INTO publications (job_id, idempotency_key) VALUES (?, ?)
    ON CONFLICT (idempotency_key) DO NOTHING
  `).run(jobId, idempotencyKey);
  const row = db.prepare("SELECT * FROM publications WHERE idempotency_key = ?")
    .get(idempotencyKey) as unknown as Publication;
  if (row.job_id !== jobId) throw new Error(`idempotency key ${idempotencyKey} belongs to another job`);
  return row;
}

export function getPublication(db: DatabaseSync, jobId: number): Publication | undefined {
  return db.prepare("SELECT * FROM publications WHERE job_id = ?").get(jobId) as unknown as Publication | undefined;
}

export function recordWordPressDraft(
  db: DatabaseSync,
  idempotencyKey: string,
  wordpressPostId: number,
  editUrl: string,
  reviewToken: string,
): Publication {
  db.prepare(`
    UPDATE publications SET status = 'draft', wordpress_post_id = ?, wordpress_url = ?, review_token = ?
    WHERE idempotency_key = ? AND status IN ('pending', 'draft')
  `).run(wordpressPostId, editUrl, reviewToken, idempotencyKey);
  const row = db.prepare("SELECT * FROM publications WHERE idempotency_key = ?")
    .get(idempotencyKey) as unknown as Publication | undefined;
  if (!row) throw new Error(`publication ${idempotencyKey} not found`);
  if (row.wordpress_post_id !== wordpressPostId) throw new Error(`publication ${idempotencyKey} already has another post`);
  return row;
}

export function invalidatePublicationReview(db: DatabaseSync, jobId: number): void {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE publications SET review_token = NULL WHERE job_id = ?").run(jobId);
    db.prepare("DELETE FROM publication_decisions WHERE job_id = ?").run(jobId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function claimPublicationDecision(
  db: DatabaseSync,
  jobId: number,
  telegramUserId: string,
  decision: PublicationDecision["decision"],
): PublicationDecision {
  db.prepare(`
    INSERT INTO publication_decisions (job_id, telegram_user_id, decision) VALUES (?, ?, ?)
    ON CONFLICT (job_id) DO NOTHING
  `).run(jobId, telegramUserId, decision);
  const row = db.prepare(`
    SELECT job_id, telegram_user_id, decision FROM publication_decisions WHERE job_id = ?
  `).get(jobId) as unknown as { job_id: number; telegram_user_id: string; decision: PublicationDecision["decision"] };
  if (row.telegram_user_id !== telegramUserId || row.decision !== decision) {
    throw new Error(`job ${jobId} already has another publication decision`);
  }
  return { jobId: row.job_id, telegramUserId: row.telegram_user_id, decision: row.decision };
}

export function completePublication(
  db: DatabaseSync,
  idempotencyKey: string,
  wordpressPostId: number,
  wordpressUrl: string,
): Publication {
  const result = db.prepare(`
    UPDATE publications
    SET status = 'published', wordpress_post_id = ?, wordpress_url = ?, published_at = CURRENT_TIMESTAMP
    WHERE idempotency_key = ? AND status IN ('pending', 'draft')
  `).run(wordpressPostId, wordpressUrl, idempotencyKey);
  const row = db.prepare("SELECT * FROM publications WHERE idempotency_key = ?")
    .get(idempotencyKey) as unknown as Publication | undefined;
  if (!row) throw new Error(`publication ${idempotencyKey} not found`);
  if (result.changes === 0 && row.wordpress_post_id !== wordpressPostId) {
    throw new Error(`publication ${idempotencyKey} already completed`);
  }
  return row;
}
