const { FieldValue } = require("firebase-admin/firestore");
const { HttpsError } = require("firebase-functions/v2/https");

function validId(id) {
  return typeof id === "string" && id.trim() === id && id.length > 0
    && !/[\/\\\x00-\x1f]/.test(id) && ![".", ".."].includes(id)
    && !/^__.*__$/.test(id) && Buffer.byteLength(id, "utf8") <= 1500;
}

function checkOwnership(session, recording, uid, sessionId) {
  // Sessions have no userId field: their authenticated hierarchy is the owner.
  if (session.userId != null && session.userId !== uid) {
    throw new HttpsError("permission-denied", "This session is unavailable.");
  }
  if (!recording) return;
  const legacy = !recording.processingStatus && recording.status === "pending_upload";
  if ((recording.userId !== uid && !(legacy && recording.userId == null))
    || (recording.sessionId !== sessionId && !(legacy && recording.sessionId == null))) {
    throw new HttpsError("permission-denied", "This recording is unavailable.");
  }
}

function audioPaths(data, uid, sessionId, recordingId) {
  const allowed = [
    `recordings/${uid}/${sessionId}/${recordingId}.m4a`,
    `users/${uid}/sessions/${sessionId}/recordings/${recordingId}.m4a`,
  ];
  const saved = data.audioPath ?? data.storagePath;
  if (saved != null && !allowed.includes(saved)) {
    throw new HttpsError("failed-precondition", "The recording audio reference is invalid. Please contact support.");
  }
  // Old/unuploaded metadata may lack a path. Only these two exact owned objects
  // can belong to this recording; never accept a path from the callable payload.
  return saved == null ? allowed : [saved];
}

function remainingRatings(documents, recordingId) {
  // The query uses the same createdAt descending ordering as Previous Attempts.
  const ratings = documents.filter((doc) => doc.id !== recordingId)
    .map((doc) => doc.data())
    .filter((data) => data.processingStatus === "completed"
      && Number.isFinite(data.aiFeedback?.overallRating)
      && data.aiFeedback.overallRating >= 0 && data.aiFeedback.overallRating <= 10)
    .map((data) => data.aiFeedback.overallRating);
  return {
    latestRating: ratings[0] ?? null,
    bestRating: ratings.length ? Math.max(...ratings) : null,
    ratingSum: Math.round(ratings.reduce((sum, rating) => sum + rating, 0) * 10) / 10,
  };
}

function createRecordingDeletion({ db, bucket, logger }) {
  return async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Please sign in again.");
    const { sessionId, recordingId } = request.data ?? {};
    if (![sessionId, recordingId].every(validId)) {
      throw new HttpsError("invalid-argument", "A valid session and recording are required.");
    }
    const sessionRef = db.doc(`users/${uid}/sessions/${sessionId}`);
    const recordingRef = sessionRef.collection("recordings").doc(recordingId);
    let stage = "claim";
    try {
      const paths = await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        if (!session.exists) throw new HttpsError("not-found", "This session no longer exists.");
        checkOwnership(session.data(), recording.data(), uid, sessionId);
        if (session.data().deleting) {
          throw new HttpsError("failed-precondition", "Session deletion is in progress. Please retry deleting the session.");
        }
        if (!recording.exists) return null;
        const paths = audioPaths(recording.data(), uid, sessionId, recordingId);
        // Retain this server-only marker and all recovery metadata on any failure.
        if (!recording.data().deleting) transaction.update(recordingRef, { deleting: true });
        return paths;
      });
      if (paths === null) return { success: true, recordingId, alreadyDeleted: true };

      stage = "storage";
      for (const path of paths) {
        await bucket.file(path).delete({ ignoreNotFound: true });
      }

      stage = "commit";
      await db.runTransaction(async (transaction) => {
        const session = await transaction.get(sessionRef);
        const recording = await transaction.get(recordingRef);
        if (!recording.exists) return; // A concurrent request already committed.
        if (!session.exists || session.data().deleting) {
          throw new HttpsError("failed-precondition", "Session deletion is in progress. Please retry deleting the session.");
        }
        checkOwnership(session.data(), recording.data(), uid, sessionId);
        if (!recording.data().deleting
          || JSON.stringify(audioPaths(recording.data(), uid, sessionId, recordingId)) !== JSON.stringify(paths)) {
          throw new HttpsError("failed-precondition", "The recording changed. Please retry deletion.");
        }
        const remaining = await transaction.get(sessionRef.collection("recordings").orderBy("createdAt", "desc"));
        transaction.update(sessionRef, {
          ...remainingRatings(remaining.docs, recordingId),
          updatedAt: FieldValue.serverTimestamp(),
        });
        // attemptCount is historically unreliable; leave it for the Progress milestone.
        transaction.delete(recordingRef);
      });
      logger.info("Recording deleted", { uid, sessionId, recordingId });
      return { success: true, recordingId };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Recording deletion failed", { uid, sessionId, recordingId, stage, code: "deletion_unavailable" });
      throw new HttpsError("unavailable", "Deletion could not finish. Please retry deleting this recording.");
    }
  };
}

module.exports = { createRecordingDeletion };
