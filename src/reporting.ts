import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./database.ts";

type PostMetric = {
  title: string;
  url: string;
  topicType: string;
  indexed: boolean;
  impressions: number;
  clicks: number;
  averagePosition: number | null;
  pageViews: number;
  revenueKrw: number;
};

export type WeeklyMetrics = {
  periodStart: string;
  indexedPosts: number | null;
  impressions: number | null;
  clicks: number | null;
  averagePosition: number | null;
  pageViews: number | null;
  revenueKrw: number | null;
  costKrw: number;
  apiCalls: number;
  monthlyBudgetKrw: number;
  duplicatePublications: number;
  secondSiteConceptDistinct: boolean;
  posts: PostMetric[];
};

function number(value: unknown, name: string, nullable = false): number | null {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

export function parseWeeklyMetrics(value: unknown): WeeklyMetrics {
  if (!value || typeof value !== "object") throw new Error("weekly metrics must be an object");
  const input = value as Record<string, unknown>;
  const start = new Date(String(input.periodStart));
  if (!Number.isFinite(start.getTime()) || !/T00:00:00[+-]\d{2}:\d{2}$/u.test(String(input.periodStart))) {
    throw new Error("periodStart must be local midnight with an explicit UTC offset");
  }
  const metrics = {
    periodStart: String(input.periodStart),
    indexedPosts: number(input.indexedPosts, "indexedPosts", true),
    impressions: number(input.impressions, "impressions", true),
    clicks: number(input.clicks, "clicks", true),
    averagePosition: number(input.averagePosition, "averagePosition", true),
    pageViews: number(input.pageViews, "pageViews", true),
    revenueKrw: number(input.revenueKrw, "revenueKrw", true),
    costKrw: number(input.costKrw, "costKrw")!,
    apiCalls: number(input.apiCalls, "apiCalls")!,
    monthlyBudgetKrw: number(input.monthlyBudgetKrw, "monthlyBudgetKrw")!,
    duplicatePublications: number(input.duplicatePublications, "duplicatePublications")!,
    secondSiteConceptDistinct: input.secondSiteConceptDistinct,
    posts: input.posts,
  };
  if (![metrics.indexedPosts, metrics.impressions, metrics.clicks, metrics.pageViews, metrics.apiCalls, metrics.duplicatePublications]
    .filter((value) => value !== null).every(Number.isInteger)
    || (metrics.clicks === null) !== (metrics.impressions === null)
    || (metrics.clicks !== null && metrics.impressions !== null && metrics.clicks > metrics.impressions)
    || typeof metrics.secondSiteConceptDistinct !== "boolean" || !Array.isArray(metrics.posts)) {
    throw new Error("weekly totals are inconsistent");
  }
  metrics.posts = metrics.posts.map((post, index) => {
    if (!post || typeof post !== "object") throw new Error(`posts[${index}] must be an object`);
    const row = post as Record<string, unknown>;
    const parsed = {
      title: String(row.title ?? "").trim(), url: String(row.url ?? "").trim(), topicType: String(row.topicType ?? "").trim(),
      indexed: row.indexed, impressions: number(row.impressions, `posts[${index}].impressions`)!,
      clicks: number(row.clicks, `posts[${index}].clicks`)!,
      averagePosition: number(row.averagePosition, `posts[${index}].averagePosition`, true),
      pageViews: number(row.pageViews, `posts[${index}].pageViews`)!,
      revenueKrw: number(row.revenueKrw, `posts[${index}].revenueKrw`)!,
    };
    if (!parsed.title || !/^https:\/\//u.test(parsed.url) || !parsed.topicType || typeof parsed.indexed !== "boolean"
      || ![parsed.impressions, parsed.clicks, parsed.pageViews].every(Number.isInteger)
      || parsed.clicks > parsed.impressions) throw new Error(`posts[${index}] is inconsistent`);
    return parsed as PostMetric;
  });
  return metrics as WeeklyMetrics;
}

function count(db: DatabaseSync, sql: string, ...params: (string | number)[]): number {
  return (db.prepare(sql).get(...params) as unknown as { count: number }).count;
}

function percent(part: number | null, total: number | null): string {
  return part === null || total === null || total === 0 ? "근거 없음" : `${((part / total) * 100).toFixed(1)}%`;
}

export function weeklyReport(db: DatabaseSync, metrics: WeeklyMetrics, history: readonly WeeklyMetrics[]): string {
  const start = new Date(metrics.periodStart);
  const end = new Date(start.getTime() + 7 * 86_400_000).toISOString();
  const published = count(db, "SELECT COUNT(*) count FROM publications WHERE published_at >= datetime(?) AND published_at < datetime(?)", metrics.periodStart, end);
  const failures = count(db, "SELECT COUNT(*) count FROM job_failures WHERE created_at >= datetime(?) AND created_at < datetime(?)", metrics.periodStart, end);
  const successes = count(db, "SELECT COUNT(*) count FROM publish_attempts WHERE status = 'success' AND created_at >= datetime(?) AND created_at < datetime(?)", metrics.periodStart, end);
  const publishFailures = count(db, "SELECT COUNT(*) count FROM publish_attempts WHERE status = 'failure' AND created_at >= datetime(?) AND created_at < datetime(?)", metrics.periodStart, end);
  const totalPublished = count(db, "SELECT COUNT(*) count FROM publications WHERE status = 'published'");
  const totalSuccesses = count(db, "SELECT COUNT(*) count FROM publish_attempts WHERE status = 'success'");
  const totalAttempts = count(db, "SELECT COUNT(*) count FROM publish_attempts");
  const sorted = [...history.filter(({ periodStart }) => periodStart !== metrics.periodStart), metrics]
    .sort((a, b) => Date.parse(a.periodStart) - Date.parse(b.periodStart));
  const lastEight = sorted.slice(-8);
  const hasExposureHistory = lastEight.length === 8 && lastEight.every(({ impressions }) => impressions !== null);
  const recent = hasExposureHistory ? lastEight.slice(-4).reduce((sum, row) => sum + row.impressions!, 0) : null;
  const previous = hasExposureHistory ? lastEight.slice(0, 4).reduce((sum, row) => sum + row.impressions!, 0) : null;
  const exposureGrowing = recent !== null && previous !== null && recent > previous;
  const valuableTypes = new Set(sorted.flatMap(({ posts }) => posts.filter(({ clicks }) => clicks > 0).map(({ topicType }) => topicType)));
  const low = metrics.posts.filter((post) => post.impressions > 0 && (post.clicks / post.impressions < 0.02 || (post.averagePosition ?? 0) > 20));
  const duplicatePublications = sorted.reduce((sum, row) => sum + row.duplicatePublications, 0);
  const recentCost = sorted.slice(-4).reduce((sum, row) => sum + row.costKrw, 0);
  const expansion = sorted.length >= 8 && totalPublished >= 30 && exposureGrowing && duplicatePublications === 0
    && totalAttempts > 0 && totalSuccesses / totalAttempts >= 0.98 && valuableTypes.size > 0
    && recentCost <= metrics.monthlyBudgetKrw && metrics.secondSiteConceptDistinct;

  return [
    `# 주간 성과 보고서 ${metrics.periodStart.slice(0, 10)}`, "",
    `- 발행: ${published}개 / 색인: ${metrics.indexedPosts === null ? "근거 없음" : `${metrics.indexedPosts}개`}`,
    `- 검색 노출: ${metrics.impressions ?? "근거 없음"} / 클릭: ${metrics.clicks ?? "근거 없음"} / CTR: ${percent(metrics.clicks, metrics.impressions)} / 평균 순위: ${metrics.averagePosition ?? "근거 없음"}`,
    `- 페이지뷰: ${metrics.pageViews ?? "근거 없음"} / 수익: ${metrics.revenueKrw === null ? "근거 없음" : `${metrics.revenueKrw.toLocaleString("ko-KR")}원`} / 비용: ${metrics.costKrw.toLocaleString("ko-KR")}원`,
    `- 실패: 작업 ${failures}건 / WordPress 발행 ${publishFailures}건 / API 호출: ${metrics.apiCalls}회`,
    `- WordPress 발행 성공률: 이번 주 ${percent(successes, successes + publishFailures)} / 누적 ${percent(totalSuccesses, totalAttempts)}`, "",
    "## 개선 우선 글", "",
    ...(low.length === 0 ? ["- 데이터로 확인된 개선 대상 없음"] : low.map((post) =>
      `- [${post.title}](${post.url}): 제목 → 구조 → 공식 출처 → 검색 의도 순서로 점검 (노출 ${post.impressions}, CTR ${percent(post.clicks, post.impressions)}, 평균 순위 ${post.averagePosition ?? "없음"})`)),
    "", "## 두 번째 WordPress 판정", "",
    `**${expansion ? "검토 가능" : "보류"}**`, "",
    `- 주간 보고 8주 이상: ${sorted.length}/8`,
    `- 검증 콘텐츠 30개 이상: ${totalPublished}/30`,
    `- 최근 4주 노출 증가: ${hasExposureHistory ? (exposureGrowing ? "충족" : "미충족") : "근거 없음"}${hasExposureHistory ? ` (${previous} → ${recent})` : ""}`,
    `- 중복 발행 0건: ${duplicatePublications === 0 ? "충족" : `미충족 (${duplicatePublications}건)`}`,
    `- 발행 성공률 98% 이상: ${percent(totalSuccesses, totalAttempts)}`,
    `- 클릭이 발생한 주제 유형: ${valuableTypes.size > 0 ? [...valuableTypes].join(", ") : "근거 없음"}`,
    `- 최근 4주 비용이 월 예산 이내: ${recentCost <= metrics.monthlyBudgetKrw ? "충족" : `미충족 (${recentCost.toLocaleString("ko-KR")}원)`}`,
    `- 두 번째 사이트 콘셉트 구분: ${metrics.secondSiteConceptDistinct ? "확인" : "미확인"}`, "",
    "Search Ads·Daum·관리 화면·OpenAI API·Hermes는 이 보고서에 실제 병목이 기록되기 전에는 추가하지 않는다.", "",
  ].join("\n");
}

function history(directory: string): WeeklyMetrics[] {
  try {
    return readdirSync(directory).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name))
      .map((name) => parseWeeklyMetrics(JSON.parse(readFileSync(resolve(directory, name), "utf8"))));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

if (import.meta.main) {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("weekly metrics JSON path is required");
  const metrics = parseWeeklyMetrics(JSON.parse(readFileSync(inputPath, "utf8")));
  const directory = resolve(process.env.VAULT_PATH ?? "./vault", "metrics");
  const name = metrics.periodStart.slice(0, 10);
  mkdirSync(directory, { recursive: true });
  const report = weeklyReport(openDatabase(), metrics, history(directory));
  const jsonPath = resolve(directory, `${name}.json`);
  const reportPath = resolve(directory, `${name}.md`);
  if (existsSync(jsonPath) || existsSync(reportPath)) throw new Error(`weekly report already exists: ${name}`);
  writeFileSync(jsonPath, `${JSON.stringify(metrics, null, 2)}\n`, { flag: "wx" });
  writeFileSync(reportPath, report, { flag: "wx" });
  console.log(reportPath);
}
