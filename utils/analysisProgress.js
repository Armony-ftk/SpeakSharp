import { RECORDING_STATUS } from "../constants/recordindStatuses.js";

export function getAnalysisProgress(recording) {
  const status = recording?.processingStatus;
  const rating = recording?.aiFeedback?.overallRating;
  return {
    ready: status === RECORDING_STATUS.COMPLETED && Number.isFinite(rating) && rating >= 0 && rating <= 10
      && typeof recording?.aiFeedback?.overallSummary === "string" && Boolean(recording.aiFeedback.overallSummary.trim()),
    active: status === RECORDING_STATUS.ANALYSING,
    failed: status === RECORDING_STATUS.FAILED && recording?.processingError?.stage === "analysis",
  };
}

export function getAnalysisErrorMessage(code) {
  const messages = {
    analysis_quota: "The AI service's free quota is exhausted. Your transcript and metrics are saved. Retry later after the quota resets.",
    analysis_auth: "AI analysis is not configured correctly. Please contact the project administrator.",
    analysis_model_unavailable: "The configured AI model is unavailable for this project. Please contact the project administrator.",
    analysis_no_transcript: "This attempt has no usable transcript. Please record a new attempt.",
    analysis_insufficient_speech: "There is too little speech for meaningful feedback. Please record a longer attempt.",
    analysis_missing_data: "AI analysis needs a usable transcript and saved metrics. Please contact the project administrator.",
    analysis_input_too_large: "The presentation text is too long for analysis. Please use a shorter context or recording.",
    analysis_timeout: "AI analysis timed out. Your transcript and metrics are safe; please retry later.",
    analysis_database_unavailable: "AI feedback could not be saved. Your transcript and metrics are safe; please retry later.",
    analysis_empty_response: "The AI service returned no usable feedback. Your transcript and metrics are safe; please retry later.",
    analysis_invalid_json: "The AI service returned invalid feedback. Your transcript and metrics are safe; please retry later.",
    analysis_invalid_response: "The AI feedback did not pass validation. Your transcript and metrics are safe; please retry later.",
  };
  return messages[code] ?? "AI analysis failed. Your transcript and metrics are safe; please retry later.";
}

export function getAnalysisRetryErrorMessage(code) {
  const messages = {
    "functions/unauthenticated": "Please sign in again before retrying.",
    "functions/resource-exhausted": "AI quota is exhausted. Please wait before retrying; daily limits may take longer to reset.",
    "functions/failed-precondition": "Analysis may still be running, or this attempt lacks usable speech or metrics. A stalled analysis can be retried after six minutes.",
    "functions/not-found": "This recording is unavailable. Reopen the session and try again.",
  };
  return messages[code] ?? "Could not request AI analysis. Check your connection and try again later.";
}
