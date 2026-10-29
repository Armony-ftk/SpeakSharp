const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");
const { buildAnalysisInput, hasSavedFeedback, parseFeedback } = require("./aiFeedback");

const STALE_ANALYSIS_MS = 6 * 60 * 1000;

const ERROR_NAMES = new Set([
  "Error", "ApiError", "APIError", "TypeError", "RangeError", "SyntaxError", "ReferenceError",
  "AggregateError", "AbortError", "TimeoutError", "RequestTimeoutError", "ZodError",
]);
const PROVIDER_CATEGORIES = new Set([
  "CANCELLED", "UNKNOWN", "INVALID_ARGUMENT", "DEADLINE_EXCEEDED", "NOT_FOUND", "ALREADY_EXISTS",
  "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "FAILED_PRECONDITION", "ABORTED", "OUT_OF_RANGE",
  "UNIMPLEMENTED", "INTERNAL", "UNAVAILABLE", "DATA_LOSS", "UNAUTHENTICATED",
]);
const PROVIDER_REASONS = new Set([
  "API_KEY_INVALID", "API_KEY_EXPIRED", "API_KEY_SERVICE_BLOCKED", "API_KEY_HTTP_REFERRER_BLOCKED",
  "API_KEY_IP_ADDRESS_BLOCKED", "API_KEY_ANDROID_APP_BLOCKED", "API_KEY_IOS_APP_BLOCKED",
  "SERVICE_DISABLED", "BILLING_DISABLED", "CONSUMER_INVALID", "RATE_LIMIT_EXCEEDED", "QUOTA_EXCEEDED",
  "ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "IAM_PERMISSION_DENIED",
]);
const NETWORK_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT", "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET",
]);

function analysisErrorDiagnostics(error) {
  let providerError = error?.error;
  // This SDK puts the provider JSON in ApiError.message. Never log that message or its details.
  if (error?.name === "ApiError" && typeof error.message === "string" && error.message.length <= 65536) {
    try { providerError = JSON.parse(error.message)?.error ?? providerError; }
    catch { /* Non-JSON errors still have safe name/status diagnostics. */ }
  }
  const reason = Array.isArray(providerError?.details) ? providerError.details.find((detail) =>
    detail?.["@type"] === "type.googleapis.com/google.rpc.ErrorInfo" && PROVIDER_REASONS.has(detail.reason))?.reason : null;
  const networkCode = [error?.code, error?.cause?.code].find((code) => NETWORK_CODES.has(code));
  return {
    errorName: ERROR_NAMES.has(error?.name) ? error.name : "UnknownError",
    errorClass: ERROR_NAMES.has(error?.constructor?.name) ? error.constructor.name : "UnknownError",
    httpStatus: Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : null,
    providerCategory: PROVIDER_CATEGORIES.has(providerError?.status) ? providerError.status : null,
    providerReason: reason ?? null,
    networkCode: networkCode ?? null,
  };
}

function shouldAnalyse(before, after) {
  return !after?.deleting && after?.processingStatus === "transcript_ready" && after.metrics != null
    && (before?.processingStatus !== "transcript_ready" || !isDeepStrictEqual(before?.metrics, after.metrics)
      || (before?.analysisJob?.attempt ?? 0) !== (after.analysisJob?.attempt ?? 0));
}

function safeAnalysisError(error, stage) {
  if (["claim", "saving"].includes(stage)) return "analysis_database_unavailable";
  if (error?.processingCode) return error.processingCode;
  if ([401, 403].includes(error?.status)) return "analysis_auth";
  if (error?.status === 429) return "analysis_quota";
  if (error?.status === 404) return "analysis_model_unavailable";
  if ([408, 504].includes(error?.status) || /timeout|abort/i.test(error?.name ?? "")) return "analysis_timeout";
  return "analysis_unavailable";
}

function ownsRecording(data, ids) {
  return data?.userId === ids.userId && data?.sessionId === ids.sessionId;
}

function createAnalysisProcessor({ db, generate, logger }) {
  return async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!shouldAnalyse(before, after)) return;
    const ids = event.params;
    const sessionRef = db.doc(`users/${ids.userId}/sessions/${ids.sessionId}`);
    const recordingRef = sessionRef.collection("recordings").doc(ids.recordingId);
    const attempt = after.analysisJob?.attempt ?? 0;
    const claimId = randomUUID();
    let claimed = false;
    let stage = "claim";

    try {
      const input = await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        const data = recording.data();
        if (!session.exists || session.data().deleting || !recording.exists || data.deleting || !ownsRecording(data, ids)
          || data.processingStatus !== "transcript_ready" || data.metrics == null
          || (data.analysisJob?.attempt ?? 0) !== attempt || hasSavedFeedback(data.aiFeedback)) return null;
        transaction.update(recordingRef, {
          processingStatus: "analysing",
          analysisJob: { id: claimId, attempt, startedAt: FieldValue.serverTimestamp() },
          processingError: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { recording: data, session: session.data() };
      });
      if (!input) return;
      claimed = true;
      stage = "validation";
      const presentation = buildAnalysisInput(input.recording, input.session);
      stage = "generation";
      const response = await generate(presentation);
      stage = "response_validation";
      const feedback = parseFeedback(response);
      stage = "saving";
      const saved = await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        const data = recording.data();
        if (!session.exists || session.data().deleting || !recording.exists || data.deleting || !ownsRecording(data, ids)
          || data.processingStatus !== "analysing" || data.analysisJob?.id !== claimId
          || hasSavedFeedback(data.aiFeedback)) return false;
        // The app orders attempts by createdAt; new recordings currently have no attemptNumber.
        const attempts = await transaction.get(sessionRef.collection("recordings").orderBy("createdAt", "desc"));
        // Match deletion's newest eligible completed attempt, including this commit.
        // A newer pending upload must not leave a stale latestRating after deletion.
        const latest = attempts.docs.find((doc) => doc.id === ids.recordingId
          || (doc.data().processingStatus === "completed"
            && Number.isFinite(doc.data().aiFeedback?.overallRating)
            && doc.data().aiFeedback.overallRating >= 0 && doc.data().aiFeedback.overallRating <= 10));
        const sessionData = session.data();
        const rating = feedback.overallRating;
        if (!Number.isFinite(sessionData.ratingSum ?? 0) || (sessionData.ratingSum ?? 0) < 0
          || !Number.isFinite(sessionData.bestRating ?? 0) || (sessionData.bestRating ?? 0) < 0
          || (sessionData.bestRating ?? 0) > 10) throw new Error("Invalid session rating aggregates");
        transaction.update(sessionRef, {
          ratingSum: Math.round(((sessionData.ratingSum ?? 0) + rating) * 10) / 10,
          bestRating: Math.max(sessionData.bestRating ?? 0, rating),
          ...(latest?.id === ids.recordingId ? { latestRating: rating } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        // This atomic commit is also the once-only aggregate contribution marker.
        transaction.update(recordingRef, {
          aiFeedback: feedback,
          processingStatus: "completed",
          processingError: FieldValue.delete(),
          analysedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (saved) logger.info("Recording analysis completed", { recordingId: ids.recordingId, attempt });
    } catch (error) {
      const code = safeAnalysisError(error, stage);
      logger.warn("Recording analysis failed", {
        recordingId: ids.recordingId, stage, code, attempt, ...analysisErrorDiagnostics(error),
      });
      if (!claimed) return;
      try {
        await db.runTransaction(async (transaction) => {
          const session = await transaction.get(sessionRef);
          const recording = await transaction.get(recordingRef);
          const data = recording.data();
          if (!session.exists || session.data().deleting || !recording.exists || data.deleting
            || data.processingStatus !== "analysing" || data.analysisJob?.id !== claimId) return;
          transaction.update(recordingRef, {
            processingStatus: "failed", processingError: { stage: "analysis", code },
            ...(code === "analysis_quota" ? { "analysisJob.retryAfter": Timestamp.fromMillis(Date.now() + 60000) } : {}),
            updatedAt: FieldValue.serverTimestamp(),
          });
        });
      } catch {
        logger.error("Could not persist analysis failure", { recordingId: ids.recordingId, code: "analysis_database_unavailable" });
      }
    }
  };
}

function createAnalysisRetry({ db, logger, now = Date.now }) {
  return async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Please sign in again.");
    const { sessionId, recordingId } = request.data ?? {};
    if (![sessionId, recordingId].every((id) => typeof id === "string" && id.trim() && !id.includes("/"))) {
      throw new HttpsError("invalid-argument", "A valid session and recording are required.");
    }
    const sessionRef = db.doc(`users/${uid}/sessions/${sessionId}`);
    const recordingRef = sessionRef.collection("recordings").doc(recordingId);
    try {
      return await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        const data = recording.data();
        if (!session.exists || session.data().deleting || !recording.exists || data.deleting
          || !ownsRecording(data, { userId: uid, sessionId })) {
          throw new HttpsError("not-found", "This recording is unavailable.");
        }
        if (data.processingStatus === "completed" || hasSavedFeedback(data.aiFeedback)) return { success: true };
        const startedAt = data.analysisJob?.startedAt?.toMillis?.();
        const stale = data.processingStatus === "analysing" && Number.isFinite(startedAt)
          && now() - startedAt > STALE_ANALYSIS_MS;
        const updatedAt = data.updatedAt?.toMillis?.();
        const waiting = data.processingStatus === "transcript_ready" && Number.isFinite(updatedAt)
          && now() - updatedAt > STALE_ANALYSIS_MS;
        const failed = data.processingStatus === "failed" && data.processingError?.stage === "analysis";
        if (!stale && !waiting && !failed) throw new HttpsError("failed-precondition", "Analysis is still processing or is not ready to retry.");
        if ((data.analysisJob?.retryAfter?.toMillis?.() ?? 0) > now()) {
          throw new HttpsError("resource-exhausted", "AI quota is exhausted. Please wait before retrying.");
        }
        try { buildAnalysisInput(data, session.data()); }
        catch { throw new HttpsError("failed-precondition", "This attempt needs a usable transcript and saved metrics. Please record a new attempt."); }
        transaction.update(recordingRef, {
          processingStatus: "transcript_ready",
          processingError: FieldValue.delete(),
          analysisJob: { attempt: (data.analysisJob?.attempt ?? 0) + 1 },
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { success: true };
      });
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Could not retry analysis", { recordingId, code: "analysis_database_unavailable" });
      throw new HttpsError("unavailable", "Could not retry AI analysis. Please try again later.");
    }
  };
}

module.exports = { createAnalysisProcessor, createAnalysisRetry, shouldAnalyse, STALE_ANALYSIS_MS };
