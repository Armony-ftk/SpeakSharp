import { test } from "node:test";
import assert from "node:assert/strict";
import { getMetricsProgress, hasSavedTranscript } from "../../utils/metricsProgress.js";

const recording = {
  processingStatus: "transcript_ready", transcript: { originalText: "Um, hello." },
  metrics: { wordCount: 2, wordsPerMinute: 12, fillerCount: 1, fillerWords: { um: 1 }, targetDurationStatus: null },
};

test("metrics completion requires all canonical fields, including the explicit optional-target result", () => {
  assert.deepEqual(getMetricsProgress(recording), { ready: true, active: false, failed: false });
  for (const key of Object.keys(recording.metrics)) {
    const incomplete = structuredClone(recording);
    delete incomplete.metrics[key];
    assert.deepEqual(getMetricsProgress(incomplete), { ready: false, active: true, failed: false });
  }
});

test("malformed metrics, invalid counts and inconsistent breakdowns cannot complete the step", () => {
  for (const change of [
    { wordCount: -1 }, { wordCount: 1.5 }, { wordCount: "2" },
    { wordsPerMinute: null }, { wordsPerMinute: NaN }, { wordsPerMinute: Infinity }, { wordsPerMinute: -1 },
    { fillerCount: 0 }, { fillerCount: -1 }, { fillerCount: 1.5 },
    { fillerWords: null }, { fillerWords: [] }, { fillerWords: {} },
    { fillerWords: { um: "1" } }, { fillerWords: { um: 1, uh: -1 } },
    { targetDurationStatus: "unknown" },
  ]) {
    assert.equal(getMetricsProgress({ ...recording, metrics: { ...recording.metrics, ...change } }).ready, false);
  }
  for (const metrics of [undefined, null, [], {}, "ready"]) {
    assert.equal(getMetricsProgress({ ...recording, metrics }).ready, false);
  }
});

test("no fillers and zero counts are valid persisted results", () => {
  assert.equal(getMetricsProgress({ ...recording,
    metrics: { wordCount: 0, wordsPerMinute: 0, fillerCount: 0, fillerWords: {}, targetDurationStatus: "under" },
  }).ready, true);
});

test("status alone never completes metrics; upload and transcription do not activate metrics", () => {
  for (const processingStatus of ["pending_upload", "transcribing", "transcript_ready", "analysing", "completed", "failed"]) {
    assert.equal(getMetricsProgress({ ...recording, processingStatus, metrics: undefined }).ready, false);
  }
  for (const processingStatus of ["pending_upload", "transcribing"]) {
    assert.deepEqual(getMetricsProgress({ ...recording, processingStatus }), { ready: false, active: false, failed: false });
  }
  for (const processingStatus of ["transcript_ready", "analysing", "completed"]) {
    assert.equal(getMetricsProgress({ ...recording, processingStatus }).ready, true);
  }
});

test("metrics failure overrides even a pre-existing complete map and retains the transcript", () => {
  for (const stage of ["metrics", "metrics_saving"]) {
    const failed = { ...recording, processingStatus: "failed", processingError: { stage } };
    assert.deepEqual(getMetricsProgress(failed), { ready: false, active: false, failed: true });
    assert.equal(hasSavedTranscript(failed), true);
  }
  assert.equal(getMetricsProgress({ ...recording, processingStatus: "failed", processingError: { stage: "transcription" } }).failed, false);
});

test("missing or malformed transcript cannot complete metrics", () => {
  for (const originalText of [undefined, null, "", "  ", 123]) {
    const invalid = { ...recording, transcript: { originalText } };
    assert.equal(hasSavedTranscript(invalid), false);
    assert.equal(getMetricsProgress(invalid).ready, false);
  }
  assert.deepEqual(getMetricsProgress(null), { ready: false, active: false, failed: false });
});
