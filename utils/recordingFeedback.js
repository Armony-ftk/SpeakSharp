import { getAnalysisProgress } from "./analysisProgress.js";

export const FEEDBACK_CRITERIA = [
  ["clarity", "Clarity"],
  ["logicalStructure", "Logical Structure"],
  ["contentRelevance", "Content Relevance"],
  ["conciseness", "Conciseness"],
  ["audienceOrientation", "Audience Orientation"],
];

export const FEEDBACK_STRUCTURE = [
  ["introduction", "Introduction"],
  ["body", "Body"],
  ["conclusion", "Conclusion"],
];

function hasText(value) {
  return typeof value === "string" && Boolean(value.trim());
}

function hasAssessment(value) {
  return Number.isFinite(value?.score) && value.score >= 0 && value.score <= 10
    && hasText(value.feedback);
}

function hasItems(value, min, max = min) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(hasText);
}

// Check only the fields the view renders; the backend owns full schema validation.
export function hasRecordingFeedback(recording) {
  if (!getAnalysisProgress(recording).ready) return false;
  const feedback = recording.aiFeedback;
  return FEEDBACK_CRITERIA.every(([key]) => hasAssessment(feedback.criteriaScores?.[key]))
    && FEEDBACK_STRUCTURE.every(([key]) => hasAssessment(feedback.structureFeedback?.[key]))
    && hasItems(feedback.strengths, 3)
    && hasItems(feedback.improvements, 3)
    && hasItems(feedback.audienceQuestions, 3, 5);
}

export function formatFeedbackNumber(value) {
  return Number.isFinite(value) && value >= 0 ? String(value) : "Unavailable";
}

export function formatFeedbackDuration(value) {
  if (!Number.isFinite(value) || value < 0) return "Unavailable";
  const seconds = Math.round(value);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatRecordingDate(value) {
  try {
    const date = typeof value?.toDate === "function" ? value.toDate() : value;
    return date instanceof Date && Number.isFinite(date.getTime())
      ? date.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      }) : null;
  } catch {
    return null;
  }
}

export function getFillerEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  return entries.every(([word, count]) => hasText(word) && Number.isSafeInteger(count) && count >= 0)
    ? entries : null;
}
