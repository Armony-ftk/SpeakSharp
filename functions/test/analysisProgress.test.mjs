import { test } from "node:test";
import assert from "node:assert/strict";
import { getAnalysisProgress, getAnalysisErrorMessage, getAnalysisRetryErrorMessage } from "../../utils/analysisProgress.js";
import { getMetricsProgress } from "../../utils/metricsProgress.js";
import {
  hasRecordingFeedback, formatFeedbackNumber, formatFeedbackDuration,
  formatRecordingDate, getFillerEntries,
} from "../../utils/recordingFeedback.js";

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

function completedRecording() {
  return {
    ...recording,
    processingStatus: "completed",
    aiFeedback: {
      overallRating: 0,
      overallSummary: "Build on the main idea with a specific example.",
      criteriaScores: Object.fromEntries([
        "clarity", "logicalStructure", "contentRelevance", "conciseness", "audienceOrientation",
      ].map((key) => [key, { score: 0, feedback: `Feedback for ${key}.` }])),
      structureFeedback: Object.fromEntries(["introduction", "body", "conclusion"]
        .map((key) => [key, { score: 0, feedback: `Feedback for ${key}.` }])),
      strengths: ["Clear topic.", "Relevant example.", "Concise opening."],
      improvements: ["Explain the example.", "Connect the ideas.", "Add a conclusion."],
      audienceQuestions: ["Why this topic?", "How does it work?", "What comes next?"],
    },
  };
}

test("feedback becomes available only on completion, including reopening and zero scores", () => {
  const saved = completedRecording();
  const before = structuredClone(saved);
  assert.equal(hasRecordingFeedback(null), false);
  for (const processingStatus of ["pending_upload", "transcribing", "transcript_ready", "analysing", "failed"]) {
    assert.equal(hasRecordingFeedback({ ...saved, processingStatus }), false);
  }
  assert.equal(hasRecordingFeedback(saved), true);
  assert.equal(hasRecordingFeedback(structuredClone(saved)), true);
  assert.equal(hasRecordingFeedback({ processingStatus: "completed" }), false);
  assert.deepEqual(saved, before);
});

test("completed feedback requires every criterion and structure score and explanation", () => {
  for (const section of ["criteriaScores", "structureFeedback"]) {
    for (const key of Object.keys(completedRecording().aiFeedback[section])) {
      for (const invalid of [undefined, null, {}, { score: "7", feedback: "Text" },
        { score: NaN, feedback: "Text" }, { score: 11, feedback: "Text" },
        { score: -1, feedback: "Text" }, { score: 7, feedback: {} }, { score: 7, feedback: " " }]) {
        const saved = completedRecording();
        saved.aiFeedback[section][key] = invalid;
        assert.equal(hasRecordingFeedback(saved), false, `${section}.${key}`);
      }
    }
  }
});

test("feedback rejects incomplete or malformed lists and accepts three to five questions", () => {
  for (const key of ["strengths", "improvements", "audienceQuestions"]) {
    for (const invalid of [null, {}, "text", [], ["One", "Two"], ["One", {}, "Three"], ["One", " ", "Three"]]) {
      const saved = completedRecording();
      saved.aiFeedback[key] = invalid;
      assert.equal(hasRecordingFeedback(saved), false, key);
    }
  }
  for (const length of [3, 4, 5, 6]) {
    const saved = completedRecording();
    saved.aiFeedback.audienceQuestions = Array.from({ length }, (_, index) => `Question ${index}?`);
    assert.equal(hasRecordingFeedback(saved), length <= 5);
  }
});

test("statistics preserve zeros and decimals and safely format unavailable values", () => {
  assert.equal(formatFeedbackNumber(0), "0");
  assert.equal(formatFeedbackNumber(119.4), "119.4");
  assert.equal(formatFeedbackDuration(0), "0:00");
  assert.equal(formatFeedbackDuration(463), "7:43");
  assert.equal(formatFeedbackDuration(59.9), "1:00");
  for (const invalid of [undefined, null, {}, "123", NaN, Infinity, -1]) {
    assert.equal(formatFeedbackNumber(invalid), "Unavailable");
    assert.equal(formatFeedbackDuration(invalid), "Unavailable");
  }
  assert.deepEqual(getFillerEntries({}), []);
  assert.deepEqual(getFillerEntries({ um: 4, "you know": 2 }), [["um", 4], ["you know", 2]]);
  for (const invalid of [undefined, null, [], "um", { um: {} }, { um: -1 }]) {
    assert.equal(getFillerEntries(invalid), null);
  }
});

test("recording dates accept Firestore timestamps and omit invalid metadata", () => {
  const date = new Date("2026-10-29T10:00:00Z");
  assert.equal(formatRecordingDate({ toDate: () => date }), formatRecordingDate(date));
  assert.ok(formatRecordingDate(date));
  for (const invalid of [undefined, null, {}, "2026-10-29", new Date(NaN),
    { toDate: () => { throw new Error("Invalid timestamp"); } }]) {
    assert.equal(formatRecordingDate(invalid), null);
  }
});
