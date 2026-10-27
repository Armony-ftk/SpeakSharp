const SINGLE_WORD_FILLERS = new Set(["um", "uh", "like", "basically",]);

function calculateSpeakingMetrics(input = {}) {
  const { originalText, durationSeconds, targetDurationSeconds } = input ?? {};
  if (typeof originalText !== "string") {
    throw new TypeError("transcript.originalText must be a string (empty text is allowed).");
  }

  // Punctuation separates words; internal straight/curly apostrophes stay in contractions.
  const words = originalText.toLowerCase().match(
    /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’][\p{L}\p{M}\p{N}]+)*/gu,
  ) ?? [];
  const duration = Number.isFinite(durationSeconds) && durationSeconds >= 0
    ? durationSeconds : null;
  const pace = duration > 0 ? words.length / (duration / 60) : NaN;
  const wordsPerMinute = Number.isFinite(pace) ? Number(pace.toFixed(1)) : null;
  const fillerBreakdown = {};

  for (let index = 0; index < words.length; index++) {
    let filler = words[index];
    if (filler === "you" && words[index + 1] === "know") {
      filler = "you know";
      index++;
    } else if (!SINGLE_WORD_FILLERS.has(filler)) {
      continue;
    }
    fillerBreakdown[filler] = (fillerBreakdown[filler] ?? 0) + 1;
  }

  let targetDurationStatus = null;
  if (duration !== null && Number.isFinite(targetDurationSeconds) && targetDurationSeconds > 0) {
    targetDurationStatus = duration < targetDurationSeconds * 0.9 ? "under"
      : duration > targetDurationSeconds * 1.1 ? "over" : "close";
  }

  return {
    durationSeconds: duration,
    wordCount: words.length,
    wordsPerMinute,
    fillerWordCount: Object.values(fillerBreakdown).reduce((total, count) => total + count, 0),
    fillerBreakdown,
    targetDurationStatus,
  };
}

module.exports = { calculateSpeakingMetrics };
