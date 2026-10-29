import { test } from "node:test";
import assert from "node:assert/strict";
import { getAnalysisProgress, getAnalysisErrorMessage, getAnalysisRetryErrorMessage } from "../../utils/analysisProgress.js";
import { getMetricsProgress } from "../../utils/metricsProgress.js";

const recording = {
  transcript: { originalText: "This is the saved speech." },
  metrics: { wordCount: 5, wordsPerMinute: 30, fillerCount: 0, fillerWords: {}, targetDurationStatus: null },
};

test("the fourth step activates only for analysing and completes only with persisted rating and summary", () => {
  for (const processingStatus of ["pending_upload", "transcribing", "transcript_ready", "failed"]) {
    assert.deepEqual(getAnalysisProgress({ ...recording, processingStatus }), { ready: false, active: false, failed: false });
  }
  assert.deepEqual(getAnalysisProgress({ ...recording, processingStatus: "analysing" }), { ready: false, active: true, failed: false });
  assert.equal(getAnalysisProgress({ ...recording, processingStatus: "completed" }).ready, false);
  for (const overallRating of [0, 7.6, 10]) {
    assert.deepEqual(getAnalysisProgress({ ...recording, processingStatus: "completed", aiFeedback: { overallRating, overallSummary: "Saved summary." } }),
      { ready: true, active: false, failed: false });
  }
  for (const overallRating of [null, "8", NaN, Infinity, -1, 11]) {
    assert.equal(getAnalysisProgress({ processingStatus: "completed", aiFeedback: { overallRating, overallSummary: "Summary" } }).ready, false);
  }
});

test("AI failures retain the successful metrics step and never complete the fourth step", () => {
  const failed = { ...recording, processingStatus: "failed", processingError: { stage: "analysis", code: "analysis_quota" } };
  assert.deepEqual(getMetricsProgress(failed), { ready: true, active: false, failed: false });
  assert.deepEqual(getAnalysisProgress(failed), { ready: false, active: false, failed: true });
  assert.equal(getMetricsProgress({ ...failed, metrics: undefined }).ready, false);
  assert.equal(getAnalysisProgress({ ...failed, processingError: { stage: "metrics" } }).failed, false);
});

test("user-facing errors are safe fixed messages including quota and retry guidance", () => {
  assert.match(getAnalysisErrorMessage("analysis_quota"), /quota/);
  assert.match(getAnalysisErrorMessage("analysis_model_unavailable"), /model/);
  assert.match(getAnalysisErrorMessage("PRIVATE internal error"), /AI analysis failed/);
  assert.ok(!getAnalysisRetryErrorMessage("PRIVATE").includes("PRIVATE"));
});
