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

interface PublishRow {
  id: number;
  job_id: number;
  idempotency_key: string;
  status: "pending" | "published";
  wordpress_post_id: number | null;
  wordpress_url: string | null;
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
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TEXT
    ) STRICT;
  `);
  return db;
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

export function beginPublication(db: DatabaseSync, jobId: number, idempotencyKey: string): PublishRow {
  if (!idempotencyKey.trim()) throw new Error("idempotency key is required");
  db.prepare(`
    INSERT INTO publications (job_id, idempotency_key) VALUES (?, ?)
    ON CONFLICT (idempotency_key) DO NOTHING
  `).run(jobId, idempotencyKey);
  const row = db.prepare("SELECT * FROM publications WHERE idempotency_key = ?")
    .get(idempotencyKey) as unknown as PublishRow;
  if (row.job_id !== jobId) throw new Error(`idempotency key ${idempotencyKey} belongs to another job`);
  return row;
}

export function completePublication(
  db: DatabaseSync,
  idempotencyKey: string,
  wordpressPostId: number,
  wordpressUrl: string,
): PublishRow {
  const result = db.prepare(`
    UPDATE publications
    SET status = 'published', wordpress_post_id = ?, wordpress_url = ?, published_at = CURRENT_TIMESTAMP
    WHERE idempotency_key = ? AND status = 'pending'
  `).run(wordpressPostId, wordpressUrl, idempotencyKey);
  const row = db.prepare("SELECT * FROM publications WHERE idempotency_key = ?")
    .get(idempotencyKey) as unknown as PublishRow | undefined;
  if (!row) throw new Error(`publication ${idempotencyKey} not found`);
  if (result.changes === 0 && row.wordpress_post_id !== wordpressPostId) {
    throw new Error(`publication ${idempotencyKey} already completed`);
  }
  return row;
}
