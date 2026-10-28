import { RECORDING_STATUS } from "../constants/recordindStatuses.js";

export function hasSavedTranscript(recording) {
  return typeof recording?.transcript?.originalText === "string"
    && Boolean(recording.transcript.originalText.trim());
}

export function getMetricsProgress(recording) {
  const status = recording?.processingStatus;
  const failed = status === RECORDING_STATUS.FAILED
    && ["metrics", "metrics_saving"].includes(recording?.processingError?.stage);
  const metrics = recording?.metrics;
  const breakdown = metrics?.fillerWords;
  const validBreakdown = breakdown !== null && typeof breakdown === "object"
    && !Array.isArray(breakdown)
    && Object.values(breakdown).every((count) => Number.isSafeInteger(count) && count > 0);
  const validMetrics = Number.isSafeInteger(metrics?.wordCount) && metrics.wordCount >= 0
    && Number.isFinite(metrics?.wordsPerMinute) && metrics.wordsPerMinute >= 0
    && Number.isSafeInteger(metrics?.fillerCount) && metrics.fillerCount >= 0
    && validBreakdown
    && Object.values(breakdown).reduce((total, count) => total + count, 0) === metrics.fillerCount
    && [null, "under", "close", "over"].includes(metrics.targetDurationStatus);
  const ready = hasSavedTranscript(recording) && validMetrics
    && [RECORDING_STATUS.TRANSCRIPT_READY, RECORDING_STATUS.ANALYSING, RECORDING_STATUS.COMPLETED].includes(status);

  return {
    ready,
    active: hasSavedTranscript(recording) && status === RECORDING_STATUS.TRANSCRIPT_READY && !ready,
    failed,
  };
}
