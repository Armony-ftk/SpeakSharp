const { test } = require("node:test");
const assert = require("node:assert/strict");
const { calculateSpeakingMetrics } = require("../speakingMetrics");

test("normal transcript returns all six metrics without changing input", () => {
  const input = Object.freeze({
    originalText: "Um, actually I like this. You know, it works.",
    durationSeconds: 40,
    targetDurationSeconds: 40,
  });
  assert.deepEqual(calculateSpeakingMetrics(input), {
    durationSeconds: 40, wordCount: 9, wordsPerMinute: 13.5,
    fillerWordCount: 3,
    fillerBreakdown: { um: 1, like: 1, "you know": 1 },
    targetDurationStatus: "close",
  });
});

test("word count handles punctuation, whitespace, contractions and Unicode", () => {
  const result = calculateSpeakingMetrics({
    originalText: "  Hello,world!\nI can't\tstop. We’re well-prepared. Café 123. ... ",
    durationSeconds: 7,
  });
  assert.equal(result.wordCount, 10);
  assert.equal(result.wordsPerMinute, 85.7);
  assert.equal(result.fillerWordCount, 0);
  assert.deepEqual(result.fillerBreakdown, {});
});

test("empty, whitespace-only and punctuation-only transcripts have no words", () => {
  for (const originalText of ["", " \n\t ", "... ! -- ' ’"]) {
    assert.deepEqual(calculateSpeakingMetrics({ originalText, durationSeconds: 60 }), {
      durationSeconds: 60, wordCount: 0, wordsPerMinute: 0,
      fillerWordCount: 0, fillerBreakdown: {}, targetDurationStatus: null,
    });
  }
});

test("missing or malformed transcripts fail clearly rather than inventing empty text", () => {
  for (const originalText of [undefined, null, 123, [], {}]) {
    assert.throws(() => calculateSpeakingMetrics({ originalText }), /originalText must be a string/);
  }
  assert.throws(() => calculateSpeakingMetrics(), /originalText must be a string/);
  assert.throws(() => calculateSpeakingMetrics(null), /originalText must be a string/);
});

test("zero duration is preserved with unavailable pace", () => {
  const result = calculateSpeakingMetrics({ originalText: "Hello", durationSeconds: 0, targetDurationSeconds: 60 });
  assert.equal(result.durationSeconds, 0);
  assert.equal(result.wordsPerMinute, null);
  assert.equal(result.targetDurationStatus, "under");
});

test("invalid or absent durations are unknown, never coerced or fabricated", () => {
  for (const durationSeconds of [undefined, null, -1, NaN, Infinity, -Infinity, "60", {}, true]) {
    const result = calculateSpeakingMetrics({ originalText: "One two", durationSeconds, targetDurationSeconds: 60 });
    assert.equal(result.durationSeconds, null);
    assert.equal(result.wordsPerMinute, null);
    assert.equal(result.targetDurationStatus, null);
    assert.equal(result.wordCount, 2);
  }
});

test("pace never exposes Infinity or NaN even for extreme numeric durations", () => {
  for (const durationSeconds of [Number.MIN_VALUE, Number.MAX_VALUE]) {
    const result = calculateSpeakingMetrics({ originalText: "Hello", durationSeconds });
    assert.ok(result.wordsPerMinute === null || Number.isFinite(result.wordsPerMinute));
  }
});

test("all fillers match case insensitively and totals equal the breakdown", () => {
  const result = calculateSpeakingMetrics({
    originalText: "UM um Uh UH like LIKE basically Basically actually ACTUALLY You know YOU KNOW",
    durationSeconds: 60,
  });
  assert.deepEqual(result.fillerBreakdown, {
    um: 2, uh: 2, like: 2, basically: 2, "you know": 2,
  });
  assert.equal(result.fillerWordCount, 10);
  assert.equal(result.fillerWordCount, Object.values(result.fillerBreakdown).reduce((a, b) => a + b, 0));
});

test("multi-word fillers count once per adjacent pair across whitespace and punctuation", () => {
  const result = calculateSpeakingMetrics({
    originalText: "you\nknow, you know; you, know. you really know. you knowledge. doyou know.",
    durationSeconds: 60,
  });
  assert.deepEqual(result.fillerBreakdown, { "you know": 3 });
  assert.equal(result.fillerWordCount, 3);
});

test("similar substrings and contractions do not match complete fillers", () => {
  const result = calculateSpeakingMetrics({
    originalText: "summer umbrella thumb unlike likely likelihood basicallyx actually2 uhura you're knowing like's",
    durationSeconds: 60,
  });
  assert.equal(result.fillerWordCount, 0);
  assert.deepEqual(result.fillerBreakdown, {});
});

test("missing or invalid targets produce no classification", () => {
  for (const targetDurationSeconds of [undefined, null, 0, -1, NaN, Infinity, "60", true]) {
    assert.equal(calculateSpeakingMetrics({
      originalText: "Hello", durationSeconds: 60, targetDurationSeconds,
    }).targetDurationStatus, null);
  }
});

for (const [durationSeconds, expected] of [
  [89.99, "under"], [90, "close"], [100, "close"], [110, "close"], [110.01, "over"],
]) {
  test(`target tolerance: ${durationSeconds} seconds of 100 is ${expected}`, () => {
    assert.equal(calculateSpeakingMetrics({
      originalText: "Hello", durationSeconds, targetDurationSeconds: 100,
    }).targetDurationStatus, expected);
  });
}
