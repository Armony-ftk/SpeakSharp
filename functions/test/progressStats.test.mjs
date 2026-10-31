import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateProgress, formatProgressRating, getProgressCards, getProgressMessage } from "../../utils/progressStats.js";

function recording(index, overrides = {}) {
  return {
    id: String(index).padStart(2, "0"), sessionId: index % 2 ? "a" : "b",
    createdAt: { seconds: index, nanoseconds: 0 }, processingStatus: "completed",
    aiFeedback: { overallRating: index < 2 ? 6 : 8 },
    metrics: { fillerCount: index < 2 ? 10 : 5, wordsPerMinute: index < 2 ? 120 : 140 },
    ...overrides,
  };
}
const four = () => Array.from({ length: 4 }, (_, index) => recording(index));
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);

test("empty sessions and attempts have unavailable ratings, never fabricated zero scores", () => {
  for (const sessionCount of [0, 3]) {
    const result = calculateProgress(sessionCount, []);
    assert.deepEqual(result.overview, { sessions: sessionCount, attempts: 0, average: null, best: null });
    assert.equal(formatProgressRating(result.overview.average), "—");
    assert.ok(getProgressCards(result).every((card) => card.delta === "Unavailable"));
  }
});

test("all documents count, while only completed numeric ratings from 0 through 10 affect ratings", () => {
  const invalid = [null, undefined, "8", false, NaN, Infinity, -1, 11].map((overallRating, index) =>
    recording(index, { aiFeedback: { overallRating } }));
  const unfinished = ["pending_upload", "transcribing", "transcript_ready", "analysing", "failed", "unexpected"]
    .map((processingStatus) => recording(1, { processingStatus }));
  const valid = [0, 8, 10].map((overallRating) => recording(1, { aiFeedback: { overallRating } }));
  const result = calculateProgress(2, [...invalid, ...unfinished, ...valid, {}]);
  assert.equal(result.overview.attempts, 18);
  near(result.overview.average, 6);
  assert.equal(result.overview.best, 10);
  assert.equal(calculateProgress(1, [recording(0, { aiFeedback: { overallRating: 0 } })]).overview.best, 0);
  assert.equal(calculateProgress(1, unfinished).overview.average, null);
});

test("overview is weighted by recordings across sessions and retains precision until display", () => {
  const data = [recording(0, { sessionId: "a", aiFeedback: { overallRating: 0 } }),
    ...Array.from({ length: 3 }, (_, i) => recording(i, { sessionId: "b", aiFeedback: { overallRating: 9 } }))];
  const result = calculateProgress(2, data);
  assert.equal(result.overview.average, 6.75);
  assert.equal(formatProgressRating(result.overview.average), "6.8");
});

test("periods are the latest four eligible recordings in chronological order, independent of input order", () => {
  const data = [...four(), recording(-1), recording(-2), recording(99, { processingStatus: "analysing" }),
    recording(100, { aiFeedback: { overallRating: null } }), recording(101, { aiFeedback: { overallRating: 11 } })];
  const result = calculateProgress(2, data.reverse());
  near(result.comparison.rating.previous, 6);
  near(result.comparison.rating.current, 8);
  near(result.comparison.rating.delta, 2);
  near(result.comparison.fillers.delta, -5);
  near(result.comparison.pace.delta, 20);
  assert.deepEqual(calculateProgress(2, data.reverse()), result);
  const cards = getProgressCards(result);
  assert.ok(cards.every((card) => card.previousLabel === "Previous 2" && card.currentLabel === "Latest 2"));
  assert.equal(cards[1].delta, "5.0 fewer");
  assert.equal(cards[2].delta, "20.0 WPM faster");
  assert.equal(cards[2].deltaTone, "neutral");
});

test("exactly four eligible recordings unlock comparison and each new attempt rolls both groups forward", () => {
  const data = four();
  const initial = calculateProgress(2, data);
  assert.equal(initial.eligibleCount, 4);
  assert.deepEqual(initial.comparison.rating, { previous: 6, current: 8, delta: 2 });
  data.push(recording(4, { aiFeedback: { overallRating: 10 }, metrics: { fillerCount: 1, wordsPerMinute: 160 } }));
  const rolled = calculateProgress(2, [...data].reverse());
  assert.deepEqual(rolled.comparison.rating, { previous: 7, current: 9, delta: 2 });
  assert.deepEqual(rolled.comparison.fillers, { previous: 7.5, current: 3, delta: -4.5 });
  assert.deepEqual(rolled.comparison.pace, { previous: 130, current: 150, delta: 20 });
  assert.deepEqual(rolled.overview, { sessions: 2, attempts: 5, average: 7.6, best: 10 });
  assert.match(getProgressMessage(rolled), /latest two attempts/);
});

test("ties sort by session and recording ID and timestamps preserve nanosecond order", () => {
  const data = four().map((r, index) => ({ ...r, sessionId: "same", createdAt: { seconds: 1, nanoseconds: index } }));
  const result = calculateProgress(1, data);
  assert.deepEqual(calculateProgress(1, [...data].reverse()), result);
  const ties = data.map((r) => ({ ...r, createdAt: { seconds: 1, nanoseconds: 0 } }));
  assert.deepEqual(calculateProgress(1, ties.reverse()), result);
  const sessionTies = four().map((r, i) => ({ ...r, id: "same", sessionId: String(i), createdAt: new Date(1000) }));
  assert.deepEqual(calculateProgress(1, sessionTies.reverse()), result);
  const reversedIds = data.map((r, i) => ({ ...r, id: String(3 - i) }));
  assert.deepEqual(calculateProgress(1, reversedIds), result);
});

test("invalid dates remain in overview but cannot fabricate a chronological comparison", () => {
  for (const createdAt of [null, "2026-10-29", 100, {}, new Date(NaN), { seconds: 1, nanoseconds: -1 }]) {
    const result = calculateProgress(2, [...four().slice(0, 3), recording(3, { createdAt })]);
    assert.equal(result.eligibleCount, 3);
    assert.equal(result.undatedCount, 1);
    assert.equal(result.overview.attempts, 4);
    assert.equal(result.overview.average, 7);
    assert.equal(result.comparison.rating, null);
  }
});

test("fewer than four eligible attempts never produce overlapping or partial comparisons", () => {
  for (let count = 0; count < 4; count++) {
    const result = calculateProgress(2, four().slice(0, count));
    assert.deepEqual(result.comparison, { rating: null, fillers: null, pace: null });
    assert.match(getProgressMessage(result), /once 4 rated attempts/);
  }
});

test("metrics are validated independently across both values without replacing recordings", () => {
  for (const invalid of [null, undefined, "0", false, -1, NaN, Infinity]) {
    const data = [recording(-1), ...four()];
    data[1].metrics.fillerCount = invalid;
    const result = calculateProgress(2, data);
    assert.equal(result.comparison.fillers, null);
    assert.notEqual(result.comparison.rating, null);
    assert.notEqual(result.comparison.pace, null);
    data[4].metrics.wordsPerMinute = invalid;
    assert.equal(calculateProgress(2, data).comparison.pace, null);
  }
  const data = four();
  data[0].metrics = undefined;
  assert.equal(calculateProgress(2, data).comparison.fillers, null);
  assert.equal(calculateProgress(2, data).comparison.pace, null);
  data[0].metrics = { fillerCount: 1.5, wordsPerMinute: 0 };
  assert.equal(calculateProgress(2, data).comparison.fillers, null);
  assert.notEqual(calculateProgress(2, data).comparison.pace, null);
  for (const r of data) r.metrics = { fillerCount: 0, wordsPerMinute: Number.MAX_VALUE };
  assert.equal(calculateProgress(2, data).comparison.pace, null);
});

test("zero metrics are valid and flat, mixed, declining and pace-only changes do not claim general improvement", () => {
  const data = four().map((r) => ({ ...r, aiFeedback: { overallRating: 0 }, metrics: { fillerCount: 0, wordsPerMinute: 0 } }));
  const flat = calculateProgress(2, data);
  assert.equal(flat.comparison.fillers.current, 0);
  assert.equal(flat.comparison.pace.delta, 0);
  assert.match(getProgressMessage(flat), /steady/);
  assert.ok(getProgressCards(flat).every((card) => card.delta === "No change" && card.deltaTone === "neutral"));
  for (const r of data.slice(2)) r.metrics.wordsPerMinute = 150;
  assert.match(getProgressMessage(calculateProgress(2, data)), /steady/);
  assert.match(getProgressMessage(calculateProgress(2, four())), /higher average rating and fewer/);
  const mixed = four();
  for (const r of mixed.slice(2)) r.metrics.fillerCount = 20;
  assert.match(getProgressMessage(calculateProgress(2, mixed)), /mixed/);
  for (const r of mixed.slice(2)) r.aiFeedback.overallRating = 3;
  assert.match(getProgressMessage(calculateProgress(2, mixed)), /chance to learn/);
  assert.ok(getProgressCards(calculateProgress(2, mixed)).every((card) => card.deltaTone === "neutral"));
});
