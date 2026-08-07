import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateScore,
  canTransition,
  createSlug,
  isTelegramOwner,
  normalizeKeyword,
  weeklyGrowth,
} from "./core.ts";
import { beginPublication, completePublication, createJob, openDatabase, transitionJob } from "./database.ts";

test("weekly growth and zero denominator", () => {
  assert.equal(weeklyGrowth([10, 10], [15, 15]), 50);
  assert.equal(weeklyGrowth([0, 0], [10, 10]), 0);
});

test("keyword normalization", () => {
  assert.equal(normalizeKeyword("  ＡＩ   PC  "), "ai pc");
});

test("weighted score clamps each signal", () => {
  assert.equal(calculateScore({
    growth: 100,
    searchVolume: 100,
    conceptFit: 100,
    problemSolving: 100,
    evergreen: 100,
    adSuitability: 100,
    audienceFit: 100,
    contentGap: 100,
  }), 100);
  assert.equal(calculateScore({
    growth: 200,
    searchVolume: -1,
    conceptFit: 0,
    problemSolving: 0,
    evergreen: 0,
    adSuitability: 0,
    audienceFit: 0,
    contentGap: 0,
  }), 20);
});

test("state transition, slug, and Telegram owner", () => {
  assert.equal(canTransition("candidate", "selected"), true);
  assert.equal(canTransition("candidate", "published"), false);
  assert.equal(createSlug("AI PC: Buying Guide!"), "ai-pc-buying-guide");
  assert.equal(isTelegramOwner(123456789, "123456789"), true);
  assert.equal(isTelegramOwner(123456788, "123456789"), false);
  assert.equal(isTelegramOwner(1, ""), false);
});

test("database prevents duplicate jobs and publications", () => {
  const db = openDatabase(":memory:");
  const first = createJob(db, "digital-life", "AI  PC", "2026-08-07");
  const duplicate = createJob(db, "digital-life", "  ai pc ", "2026-08-07");
  assert.equal(duplicate.id, first.id);
  assert.equal(db.prepare("SELECT count(*) AS count FROM jobs").get()!.count, 1);

  assert.throws(() => transitionJob(db, first.id, "published"), /invalid job transition/u);
  assert.equal(transitionJob(db, first.id, "selected").status, "selected");

  const attempt = beginPublication(db, first.id, "digital-life/2026-08-07/ai-pc");
  const repeated = beginPublication(db, first.id, "digital-life/2026-08-07/ai-pc");
  assert.equal(repeated.id, attempt.id);
  const other = createJob(db, "digital-life", "Laptop", "2026-08-07");
  assert.throws(
    () => beginPublication(db, other.id, "digital-life/2026-08-07/ai-pc"),
    /belongs to another job/u,
  );
  assert.equal(completePublication(db, attempt.idempotency_key, 42, "https://example.com/ai-pc").status, "published");
  assert.equal(completePublication(db, attempt.idempotency_key, 42, "https://example.com/ai-pc").wordpress_post_id, 42);
  db.close();
});
