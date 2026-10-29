import { RECORDING_STATUS } from "../constants/recordindStatuses.js";

const PERIOD_SIZE = 2;

function validRating(recording) {
  const rating = recording?.aiFeedback?.overallRating;
  return recording?.processingStatus === RECORDING_STATUS.COMPLETED
    && Number.isFinite(rating) && rating >= 0 && rating <= 10;
}

function timestampParts(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const seconds = Math.floor(value.getTime() / 1000);
    return { seconds, nanoseconds: (value.getTime() - seconds * 1000) * 1e6 };
  }
  if (Number.isSafeInteger(value?.seconds) && Number.isInteger(value?.nanoseconds)
    && value.nanoseconds >= 0 && value.nanoseconds < 1e9) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  return null;
}

function mean(values) {
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Number.isFinite(average) ? average : null;
}

function compare(previous, current, readValue, validate) {
  const before = previous.map(readValue);
  const after = current.map(readValue);
  // Keep all three metrics on the same complete two-attempt periods.
  if (before.length !== PERIOD_SIZE || after.length !== PERIOD_SIZE
    || !before.every(validate) || !after.every(validate)) return null;
  const previousAverage = mean(before);
  const currentAverage = mean(after);
  if (previousAverage === null || currentAverage === null) return null;
  return { previous: previousAverage, current: currentAverage, delta: currentAverage - previousAverage };
}

export function calculateProgress(sessionCount, recordings) {
  const rated = recordings.filter(validRating);
  const chronological = rated.map((recording) => ({ recording, time: timestampParts(recording.createdAt) }))
    .filter(({ time }) => time !== null)
    .sort((a, b) => {
      const timeOrder = a.time.seconds - b.time.seconds || a.time.nanoseconds - b.time.nanoseconds;
      if (timeOrder) return timeOrder;
      const aKey = `${a.recording.sessionId}/${a.recording.id}`;
      const bKey = `${b.recording.sessionId}/${b.recording.id}`;
      return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    }).map(({ recording }) => recording);
  const enoughData = chronological.length >= PERIOD_SIZE * 2;
  const previous = enoughData ? chronological.slice(-PERIOD_SIZE * 2, -PERIOD_SIZE) : [];
  const current = enoughData ? chronological.slice(-PERIOD_SIZE) : [];
  const ratings = rated.map((recording) => recording.aiFeedback.overallRating);
  return {
    overview: {
      sessions: sessionCount,
      attempts: recordings.length,
      average: mean(ratings),
      best: ratings.length ? ratings.reduce((best, rating) => Math.max(best, rating), 0) : null,
    },
    eligibleCount: chronological.length,
    undatedCount: rated.length - chronological.length,
    comparison: {
      rating: compare(previous, current, (r) => r.aiFeedback.overallRating, Number.isFinite),
      fillers: compare(previous, current, (r) => r.metrics?.fillerCount,
        (value) => Number.isSafeInteger(value) && value >= 0),
      pace: compare(previous, current, (r) => r.metrics?.wordsPerMinute,
        (value) => Number.isFinite(value) && value >= 0),
    },
  };
}

export function formatProgressRating(value) {
  return Number.isFinite(value) ? value.toFixed(1) : "—";
}

function roundedChange(value) {
  return Number(value.toFixed(1));
}

export function getProgressCards({ comparison }) {
  return [
    ["Average Rating", comparison.rating, "rating"],
    ["Filler Words", comparison.fillers, "fillers"],
    ["Speaking Pace", comparison.pace, "pace"],
  ].map(([label, values, metric]) => {
    const base = { label, previousLabel: "Previous 2", currentLabel: "Latest 2", deltaTone: "neutral" };
    if (!values) return { ...base, previousValue: "—", currentValue: "—", delta: "Unavailable" };
    const change = roundedChange(values.delta);
    const magnitude = Math.abs(change).toFixed(1);
    const unit = metric === "pace" ? " WPM" : "";
    let delta = "No change";
    if (change !== 0) {
      if (metric === "rating") delta = `${change > 0 ? "+" : "−"}${magnitude}`;
      if (metric === "fillers") delta = `${magnitude} ${change < 0 ? "fewer" : "more"}`;
      if (metric === "pace") delta = `${magnitude} WPM ${change < 0 ? "slower" : "faster"}`;
    }
    return {
      ...base,
      previousValue: `${values.previous.toFixed(1)}${unit}`,
      currentValue: `${values.current.toFixed(1)}${unit}`,
      delta,
      deltaTone: (metric === "rating" && change > 0) || (metric === "fillers" && change < 0)
        ? "positive" : "neutral",
    };
  });
}

export function getProgressMessage({ eligibleCount, comparison }) {
  if (eligibleCount < PERIOD_SIZE * 2) {
    return "Keep practising! Comparisons will appear once 4 rated attempts with recording dates are available.";
  }
  const rating = roundedChange(comparison.rating.delta);
  const fillers = comparison.fillers ? roundedChange(comparison.fillers.delta) : null;
  if ((rating > 0 || fillers < 0) && (rating < 0 || fillers > 0)) {
    return "Your results are mixed across the two periods. Keep practising and focus on one area at a time.";
  }
  if (rating > 0 && fillers < 0) return "Your latest two attempts have a higher average rating and fewer filler words. Keep practising!";
  if (rating > 0) return "Your latest two attempts have a higher average rating. Keep building on your practice!";
  if (fillers < 0) return "Your latest two attempts use fewer filler words on average. Keep practising!";
  if (rating === 0 && (fillers === null || fillers === 0)) {
    return "Your available results are steady at the displayed precision. Keep practising and use your feedback to guide your next attempt.";
  }
  return "Every attempt is a chance to learn. Review your feedback and focus on one improvement in your next practice.";
}
