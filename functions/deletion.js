const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { logger } = require("firebase-functions");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

const db = getFirestore();

const deleteSession = onCall(
  {
    region: "us-central1",
    invoker: "public",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Authentication is required.");
    }

    const sessionId = request.data?.sessionId;
    if (
      typeof sessionId !== "string" ||
      !sessionId.trim() ||
      sessionId.includes("/")
    ) {
      throw new HttpsError("invalid-argument", "A valid session ID is required.");
    }

    const normalizedId = sessionId.trim();
    const sessionReference = db.doc(
      `users/${uid}/sessions/${normalizedId}`,
    );

    try {
      const sessionSnapshot = await sessionReference.get();
      if (!sessionSnapshot.exists) {
        throw new HttpsError("not-found", "The session does not exist.");
      }

      // Block new uploads and transcription claims before removing either audio layout.
      // Keep the marker on failure so retrying deletion can safely finish the cascade.
      await sessionReference.update({ deleting: true });
      for (const prefix of [
        `users/${uid}/sessions/${normalizedId}/recordings/`,
        `recordings/${uid}/${normalizedId}/`,
      ]) {
        await getStorage().bucket().deleteFiles({ prefix, force: true });
      }

      await db.recursiveDelete(sessionReference);
      logger.info("Practice session deleted", { uid, sessionId: normalizedId });
      return { success: true, sessionId: normalizedId };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("Practice session deletion failed", {
        uid,
        sessionId: normalizedId,
        error,
      });
      throw new HttpsError("internal", "The session could not be deleted.");
    }
  },
);

module.exports = { deleteSession };
