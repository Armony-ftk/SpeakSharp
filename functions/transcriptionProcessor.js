const { FieldValue } = require("firebase-admin/firestore");
const { calculateSpeakingMetrics } = require("./speakingMetrics");

const MAX_AUDIO_BYTES = 32 * 1024 * 1024;
const MAX_DURATION_SECONDS = 900;
const AUDIO_TYPES = new Set(["audio/mp4", "audio/m4a", "audio/x-m4a"]);

function processingError(code) {
  return Object.assign(new Error(code), { processingCode: code });
}

function parseRecordingPath(name) {
  if (typeof name !== "string") return null;
  const match = name.match(/^recordings\/([^/]+)\/([^/]+)\/([^/]+)\.m4a$/)
    || name.match(/^users\/([^/]+)\/sessions\/([^/]+)\/recordings\/([^/]+)\.m4a$/);
  return match ? { userId: match[1], sessionId: match[2], recordingId: match[3] } : null;
}

function validateAudio(object, duration) {
  if (!Number.isInteger(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS) {
    throw processingError("invalid_duration");
  }
  const size = Number(object.size);
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_AUDIO_BYTES) {
    throw processingError("invalid_audio_size");
  }
  if (!AUDIO_TYPES.has(object.contentType)) {
    throw processingError("unsupported_audio");
  }
}

function extractTranscript(response) {
  const alternative = response?.results?.channels?.[0]?.alternatives?.[0];
  if (typeof alternative?.transcript !== "string") {
    throw processingError("invalid_response");
  }
  if (!alternative.transcript.trim()) throw processingError("no_speech");
  const duration = response?.metadata?.duration;
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DURATION_SECONDS + 1) {
    throw processingError("invalid_audio_duration");
  }

  const transcript = { originalText: alternative.transcript };
  if (Array.isArray(alternative.words) && alternative.words.length > 0) {
    // Keep the unformatted words (including fillers) and timing for the next phase.
    const words = alternative.words.map(({ word, start, end }) => ({ word, start, end }));
    if (words.every(({ word, start, end }) => typeof word === "string"
      && Number.isFinite(start) && Number.isFinite(end) && start >= 0
      && end >= start && end <= duration + 1)) {
      transcript.words = words;
    }
  }
  // Leave ample room in Firestore's 1 MiB document limit for future analysis.
  if (Buffer.byteLength(JSON.stringify(transcript), "utf8") > 350000) {
    delete transcript.words;
  }
  if (Buffer.byteLength(transcript.originalText, "utf8") > 200000) {
    throw processingError("transcript_too_large");
  }
  return transcript;
}

function safeErrorCode(error, stage) {
  if (stage === "metrics") return "metrics_calculation_failed";
  if (stage === "metrics_saving") return "database_unavailable";
  if (error?.processingCode) return error.processingCode;
  if (["saving", "claim", "checking"].includes(stage)) return "database_unavailable";
  if (stage === "download") return Number(error?.code) === 404 ? "audio_missing" : "audio_unavailable";
  if (error?.statusCode === 401 || error?.statusCode === 403) return "provider_auth";
  if (error?.statusCode === 402) return "provider_credits";
  if (error?.statusCode === 429) return "provider_rate_limit";
  if (error?.statusCode === 400 || error?.statusCode === 415) return "invalid_audio";
  if (/timeout|abort/i.test(error?.name ?? "")) return "provider_timeout";
  return "provider_unavailable";
}

function ownsRecording(data, ids, name) {
  const legacy = !data.processingStatus && data.status === "pending_upload" && name.startsWith("users/");
  return (data.userId === ids.userId || (legacy && data.userId == null))
    && (data.sessionId === ids.sessionId || (legacy && data.sessionId == null))
    && (data.audioPath ?? data.storagePath) === name;
}

// Dependencies are injected so the actual event handler can be tested without cloud calls.
function createTranscriptionProcessor({ db, bucketName, downloadAudio, transcribe, logger,
  calculateMetrics = calculateSpeakingMetrics }) {
  return async (event) => {
    const object = event.data;
    const ids = parseRecordingPath(object?.name);
    if (!ids || object.bucket !== bucketName || !/^\d+$/.test(String(object.generation ?? ""))) return;

    const generation = String(object.generation);
    const sessionRef = db.doc(`users/${ids.userId}/sessions/${ids.sessionId}`);
    const recordingRef = sessionRef.collection("recordings").doc(ids.recordingId);
    let stage = "claim";
    let claimed = false;

    async function finish(updates, expectedStatus = "transcribing") {
      return db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        const data = recording.data();
        if (!session.exists || session.data().deleting || !recording.exists
          || !ownsRecording(data, ids, object.name)
          || data.processingStatus !== expectedStatus
          || data.transcriptionJob?.generation !== generation) return false;
        // update, never set: deletion must not resurrect a recording.
        const fields = typeof updates === "function" ? updates(data, session.data()) : updates;
        transaction.update(recordingRef, { ...fields, updatedAt: FieldValue.serverTimestamp() });
        return true;
      });
    }

    try {
      const claim = await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        if (!session.exists || session.data().deleting || !recording.exists) return null;
        const data = recording.data();
        if (!ownsRecording(data, ids, object.name)) return null;
        const status = data.processingStatus ?? data.status;
        const previousGeneration = data.transcriptionJob?.generation;
        if (!["pending_upload", "failed"].includes(status)
          || (/^\d+$/.test(previousGeneration ?? "") && BigInt(previousGeneration) >= BigInt(generation))
          || (typeof data.transcript?.originalText === "string" && data.transcript.originalText.trim())) return null;
        // Only a new object generation (an explicit user re-upload) can retry a failure.
        transaction.update(recordingRef, {
          userId: ids.userId,
          sessionId: ids.sessionId,
          audioPath: object.name,
          durationSeconds: data.durationSeconds ?? data.duration ?? null,
          processingStatus: "transcribing",
          status: FieldValue.delete(),
          storagePath: FieldValue.delete(),
          duration: FieldValue.delete(),
          processingError: FieldValue.delete(),
          transcriptionJob: { generation, startedAt: FieldValue.serverTimestamp() },
          uploadedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { duration: data.durationSeconds ?? data.duration };
      });
      if (claim === null) return;
      claimed = true;
      stage = "validation";
      validateAudio(object, claim.duration);
      stage = "download";
      const audio = await downloadAudio(object);
      if (!Buffer.isBuffer(audio) || audio.length !== Number(object.size)
        || audio.length < 12 || audio.toString("ascii", 4, 8) !== "ftyp") {
        throw processingError("invalid_audio");
      }

      // Recheck after download to avoid paying for a session being deleted.
      stage = "checking";
      const session = await sessionRef.get();
      const recording = await recordingRef.get();
      if (!session.exists || session.data().deleting || !recording.exists
        || recording.data().transcriptionJob?.generation !== generation
        || recording.data().processingStatus !== "transcribing") return;

      stage = "transcription";
      const response = await transcribe(audio);
      const transcript = extractTranscript(response);
      stage = "saving";
      const saved = await finish({
        transcript,
        processingStatus: "transcript_ready",
        processingError: FieldValue.delete(),
        transcribedAt: FieldValue.serverTimestamp(),
      });
      if (!saved) return;
      logger.info("Recording transcription ready", { recordingId: ids.recordingId, generation });

      // The transcript is already committed. Metrics failure must not discard it.
      stage = "metrics_saving";
      const metricsSaved = await finish((data, sessionData) => {
        stage = "metrics";
        const metrics = calculateMetrics({
          originalText: data.transcript.originalText,
          durationSeconds: data.durationSeconds,
          targetDurationSeconds: sessionData.targetDurationSeconds,
        });
        stage = "metrics_saving";
        return {
          "metrics.wordCount": metrics.wordCount,
          "metrics.wordsPerMinute": metrics.wordsPerMinute,
          "metrics.fillerCount": metrics.fillerWordCount,
          "metrics.fillerWords": metrics.fillerBreakdown,
          "metrics.targetDurationStatus": metrics.targetDurationStatus,
          processingError: FieldValue.delete(),
        };
      }, "transcript_ready");
      if (metricsSaved) logger.info("Recording metrics ready", { recordingId: ids.recordingId, generation });
    } catch (error) {
      const code = safeErrorCode(error, stage);
      const metricsFailed = stage === "metrics" || stage === "metrics_saving";
      logger.warn(metricsFailed ? "Recording metrics failed" : "Recording transcription failed", {
        recordingId: ids.recordingId, generation, stage, code,
      });
      if (!claimed) return; // A failed claim must never overwrite a different worker's claim.
      try {
        await finish({ processingStatus: "failed", processingError: { stage, code } },
          metricsFailed ? "transcript_ready" : "transcribing");
      } catch {
        // No external retry: a database outage must not cause another paid request.
        logger.error(metricsFailed ? "Could not persist metrics failure" : "Could not persist transcription failure", {
          recordingId: ids.recordingId, generation, code: "database_unavailable",
        });
      }
    }
  };
}

module.exports = {
  createTranscriptionProcessor, extractTranscript, parseRecordingPath,
  processingError, MAX_AUDIO_BYTES,
};
