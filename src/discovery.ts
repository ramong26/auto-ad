import type { DatabaseSync } from "node:sqlite";
import { calculateScore, normalizeKeyword, weeklyGrowth } from "./core.ts";
import {
  createJob,
  getTrendCache,
  hasRecentKeyword,
  putTrendCache,
  recordJobFailure,
  saveTopicDetails,
} from "./database.ts";

const SEARCH_TREND_URL = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";
const DAY_MS = 86_400_000;

interface TrendResponse {
  results?: Array<{
    data?: Array<{ period?: string; ratio?: number }>;
  }>;
}

export interface TrendCredentials {
  keyId: string;
  key: string;
}

export interface TrendResult {
  keyword: string;
  startDate: string;
  endDate: string;
  growth: number;
  ratios: number[];
  cached: boolean;
}

export class TrendFetchError extends Error {
  readonly kind: string;

  constructor(kind: string, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface TopicSeed {
  keyword: string;
  conceptFit: number;
  risk: "low" | "medium" | "high";
  searchVolume?: number;
  problemSolving?: number;
  evergreen?: number;
  adSuitability?: number;
  audienceFit?: number;
  contentGap?: number;
}

export interface TopicCandidate {
  jobId: number;
  blog: string;
  keyword: string;
  runDate: string;
  growth: number;
  score: number;
  conceptFit: number;
  risk: "low" | "medium";
}

export interface DiscoveryResult {
  candidates: TopicCandidate[];
  failures: Array<{ keyword: string; reason: string }>;
}

export function trendRange(runDate: string): { startDate: string; endDate: string } {
  const end = new Date(`${runDate}T00:00:00Z`);
  if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== runDate) {
    throw new Error(`invalid run date: ${runDate}`);
  }
  const start = new Date(end.getTime() - 13 * DAY_MS);
  return { startDate: start.toISOString().slice(0, 10), endDate: runDate };
}

function parseTrend(keyword: string, startDate: string, endDate: string, body: TrendResponse): TrendResult {
  const data = body.results?.[0]?.data;
  if (!data || data.length !== 14) throw new TrendFetchError("empty_result", "NAVER returned no complete 14-day result");
  const sorted = [...data].sort((a, b) => String(a.period).localeCompare(String(b.period)));
  if (sorted[0]?.period !== startDate || sorted[13]?.period !== endDate) {
    throw new TrendFetchError("invalid_period", "NAVER returned an unexpected date range");
  }
  const ratios = sorted.map(({ ratio }) => ratio);
  if (ratios.some((ratio) => typeof ratio !== "number" || !Number.isFinite(ratio))) {
    throw new TrendFetchError("empty_result", "NAVER returned an invalid ratio");
  }
  return {
    keyword,
    startDate,
    endDate,
    growth: weeklyGrowth(ratios.slice(0, 7) as number[], ratios.slice(7) as number[]),
    ratios: ratios as number[],
    cached: false,
  };
}

export async function fetchTrend(
  db: DatabaseSync,
  keyword: string,
  runDate: string,
  credentials: TrendCredentials,
  request: typeof fetch = fetch,
  now = Date.now(),
): Promise<TrendResult> {
  const { startDate, endDate } = trendRange(runDate);
  const cacheKey = `${normalizeKeyword(keyword)}:${startDate}:${endDate}`;
  const cached = getTrendCache(db, cacheKey, now - DAY_MS);
  if (cached) return { ...parseTrend(keyword, startDate, endDate, JSON.parse(cached.payload) as TrendResponse), cached: true };
  if (!credentials.keyId || !credentials.key) throw new TrendFetchError("credentials", "NAVER credentials are required");

  let response: Response;
  try {
    response = await request(SEARCH_TREND_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ncp-apigw-api-key-id": credentials.keyId,
        "x-ncp-apigw-api-key": credentials.key,
      },
      body: JSON.stringify({
        startDate,
        endDate,
        timeUnit: "date",
        keywordGroups: [{ groupName: keyword, keywords: [keyword] }],
      }),
    });
  } catch {
    throw new TrendFetchError("network", "NAVER request failed");
  }
  if (response.status === 429) throw new TrendFetchError("rate_limited", "NAVER rate limit exceeded");
  if (response.status >= 500) throw new TrendFetchError("server", `NAVER server error ${response.status}`);
  if (!response.ok) throw new TrendFetchError("request", `NAVER request rejected with ${response.status}`);

  let body: TrendResponse;
  try {
    body = await response.json() as TrendResponse;
  } catch {
    throw new TrendFetchError("invalid_response", "NAVER returned invalid JSON");
  }
  const result = parseTrend(keyword, startDate, endDate, body);
  putTrendCache(db, cacheKey, JSON.stringify(body), now);
  return result;
}

export async function discoverCandidates(
  db: DatabaseSync,
  blog: string,
  runDate: string,
  seeds: readonly TopicSeed[],
  credentials: TrendCredentials,
  request: typeof fetch = fetch,
  now = Date.now(),
): Promise<DiscoveryResult> {
  const candidates: TopicCandidate[] = [];
  const failures: DiscoveryResult["failures"] = [];
  for (const seed of seeds) {
    const job = createJob(db, blog, seed.keyword, runDate);
    if (job.status !== "candidate") {
      failures.push({ keyword: seed.keyword, reason: `job already ${job.status}` });
      continue;
    }
    if (seed.risk === "high" || hasRecentKeyword(db, blog, seed.keyword, runDate, job.id)) {
      const reason = seed.risk === "high" ? "risk: high" : "duplicate: recent 90 days";
      recordJobFailure(db, job.id, reason);
      failures.push({ keyword: seed.keyword, reason });
      continue;
    }
    try {
      const trend = await fetchTrend(db, seed.keyword, runDate, credentials, request, now);
      const score = calculateScore({
        growth: Math.max(0, Math.min(100, 50 + trend.growth)),
        searchVolume: seed.searchVolume ?? 0,
        conceptFit: seed.conceptFit,
        problemSolving: seed.problemSolving ?? seed.conceptFit,
        evergreen: seed.evergreen ?? 50,
        adSuitability: seed.adSuitability ?? 50,
        audienceFit: seed.audienceFit ?? seed.conceptFit,
        contentGap: seed.contentGap ?? 50,
      }) - (seed.risk === "medium" ? 15 : 0);
      const candidate: TopicCandidate = {
        jobId: job.id,
        blog,
        keyword: seed.keyword,
        runDate,
        growth: trend.growth,
        score,
        conceptFit: seed.conceptFit,
        risk: seed.risk,
      };
      candidates.push(candidate);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown trend failure";
      recordJobFailure(db, job.id, reason);
      failures.push({ keyword: seed.keyword, reason });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.keyword.localeCompare(b.keyword, "ko"));
  const selected = candidates.slice(0, 3);
  for (const candidate of selected) saveTopicDetails(db, candidate);
  return { candidates: selected, failures };
}
