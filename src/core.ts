export const jobStatuses = [
  "candidate",
  "selected",
  "inbox",
  "drafting",
  "review",
  "revision_requested",
  "approved",
  "publishing",
  "published",
  "failed",
] as const;

export type JobStatus = (typeof jobStatuses)[number];

const transitions: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  candidate: ["selected", "failed"],
  selected: ["inbox", "failed"],
  inbox: ["drafting", "failed"],
  drafting: ["review", "failed"],
  review: ["approved", "revision_requested", "failed"],
  revision_requested: ["inbox", "failed"],
  approved: ["publishing", "failed"],
  publishing: ["published", "approved", "failed"],
  published: [],
  failed: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return transitions[from].includes(to);
}

export function weeklyGrowth(previous: readonly number[], recent: readonly number[]): number {
  const previousTotal = previous.reduce((sum, value) => sum + value, 0);
  const recentTotal = recent.reduce((sum, value) => sum + value, 0);
  return previousTotal === 0 ? 0 : ((recentTotal - previousTotal) / previousTotal) * 100;
}

export function normalizeKeyword(keyword: string): string {
  return keyword.normalize("NFKC").trim().toLocaleLowerCase("ko-KR").replace(/\s+/gu, " ");
}

export interface ScoreSignals {
  growth: number;
  searchVolume: number;
  conceptFit: number;
  problemSolving: number;
  evergreen: number;
  adSuitability: number;
  audienceFit: number;
  contentGap: number;
}

export function calculateScore(signals: ScoreSignals): number {
  const clamp = (value: number) => Math.min(100, Math.max(0, value));
  return (
    clamp(signals.growth) * 0.2 +
    clamp(signals.searchVolume) * 0.15 +
    clamp(signals.conceptFit) * 0.2 +
    clamp(signals.problemSolving) * 0.15 +
    clamp(signals.evergreen) * 0.1 +
    clamp(signals.adSuitability) * 0.1 +
    clamp(signals.audienceFit) * 0.05 +
    clamp(signals.contentGap) * 0.05
  );
}

export function createSlug(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/gu, "")
    .normalize("NFC")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

export function isTelegramOwner(userId: string | number, ownerId: string): boolean {
  return ownerId.trim() !== "" && String(userId) === ownerId.trim();
}
