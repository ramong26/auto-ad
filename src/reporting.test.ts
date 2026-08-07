import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "./database.ts";
import { parseWeeklyMetrics, weeklyReport, type WeeklyMetrics } from "./reporting.ts";

function metrics(periodStart: string, impressions: number, clicks = 10): WeeklyMetrics {
  return parseWeeklyMetrics({
    periodStart, indexedPosts: 30, impressions, clicks, averagePosition: 12,
    pageViews: 100, revenueKrw: 1_000, costKrw: 5_000, apiCalls: 0,
    monthlyBudgetKrw: 25_000, duplicatePublications: 0, secondSiteConceptDistinct: true,
    posts: [{
      title: "Windows 백업", url: "https://blog.example/windows-backup", topicType: "Windows",
      indexed: true, impressions, clicks, averagePosition: 12, pageViews: 100, revenueKrw: 1_000,
    }],
  });
}

test("weekly report uses accumulated evidence for the expansion gate", () => {
  const db = openDatabase(":memory:");
  for (let id = 1; id <= 30; id += 1) {
    db.prepare("INSERT INTO jobs (id, blog, keyword, normalized_keyword, run_date, status) VALUES (?, 'blog', ?, ?, '2026-07-01', 'published')")
      .run(id, `keyword ${id}`, `keyword ${id}`);
    db.prepare("INSERT INTO publications (job_id, idempotency_key, status, wordpress_post_id, wordpress_url, published_at) VALUES (?, ?, 'published', ?, ?, '2026-08-05 00:00:00')")
      .run(id, `blog/2026-07-01/post-${id}`, id, `https://blog.example/post-${id}`);
  }
  for (let attempt = 1; attempt <= 50; attempt += 1) {
    db.prepare("INSERT INTO publish_attempts (job_id, attempt, status, created_at) VALUES (1, ?, ?, '2026-08-05 00:00:00')")
      .run(attempt, attempt === 50 ? "failure" : "success");
  }
  const starts = ["2026-06-15", "2026-06-22", "2026-06-29", "2026-07-06", "2026-07-13", "2026-07-20", "2026-07-27"];
  const history = starts.map((day, index) => metrics(`${day}T00:00:00+09:00`, index < 4 ? 100 : 200));
  const current = metrics("2026-08-03T00:00:00+09:00", 200, 1);
  current.posts[0]!.averagePosition = 25;

  const report = weeklyReport(db, current, history);
  assert.match(report, /누적 98\.0%/u);
  assert.match(report, /\*\*검토 가능\*\*/u);
  assert.match(report, /제목 → 구조 → 공식 출처 → 검색 의도/u);
  assert.throws(() => parseWeeklyMetrics({ ...current, clicks: 201 }), /inconsistent/u);
  const unavailable = parseWeeklyMetrics({ ...current, indexedPosts: null, impressions: null, clicks: null, pageViews: null, revenueKrw: null, posts: [] });
  assert.match(weeklyReport(db, unavailable, []), /검색 노출: 근거 없음[\s\S]*최근 4주 노출 증가: 근거 없음/u);
  db.close();
});
