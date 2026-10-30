const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { logger } = require("firebase-functions");
const { HttpsError, onCall } = require("firebase-functions/v2/https");

initializeApp();

const db = getFirestore();

function createDeleteSessionHandler({
  getAuth: getAuthDependency = getAuth,
  getDb = () => db,
  getStorage: getStorageDependency = getStorage,
  loggerDependency = logger,
} = {}) {
  return async (request) => {
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
    const authService = getAuthDependency();
    const firestore = getDb();

    let authUser;

    try {
      authUser = await authService.getUser(uid);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError("permission-denied", "Access is denied.");
      }

      loggerDependency.error("Session deletion authorization failed", {
        uid,
        error,
      });
      throw new HttpsError("internal", "The session could not be deleted.");
    }

    if (authUser.disabled) {
      throw new HttpsError("permission-denied", "Access is denied.");
    }

    const profileReference = firestore.doc(`users/${uid}`);
    let profileSnapshot;

    try {
      profileSnapshot = await profileReference.get();
    } catch (error) {
      loggerDependency.error("Session deletion profile check failed", {
        uid,
        error,
      });
      throw new HttpsError("internal", "The session could not be deleted.");
    }

    if (!profileSnapshot.exists) {
      throw new HttpsError("not-found", "The user profile does not exist.");
    }

    if (profileSnapshot.data()?.disabled === true) {
      throw new HttpsError("permission-denied", "Access is denied.");
    }

    const sessionReference = firestore.doc(
      `users/${uid}/sessions/${normalizedId}`,
    );

    try {
      const sessionSnapshot = await sessionReference.get();
      if (!sessionSnapshot.exists) {
        throw new HttpsError("not-found", "The session does not exist.");
      }

      const recordingPrefix =
        `users/${uid}/sessions/${normalizedId}/recordings/`;
      await getStorageDependency().bucket().deleteFiles({
        prefix: recordingPrefix,
        force: true,
      });

      await firestore.recursiveDelete(sessionReference);
      loggerDependency.info("Practice session deleted", {
        uid,
        sessionId: normalizedId,
      });
      return { success: true, sessionId: normalizedId };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      loggerDependency.error("Practice session deletion failed", {
        uid,
        sessionId: normalizedId,
        error,
      });
      throw new HttpsError("internal", "The session could not be deleted.");
    }
  };
}

const deleteSession = onCall(
  {
    region: "us-central1",
    invoker: "public",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  createDeleteSessionHandler(),
);

module.exports = { createDeleteSessionHandler, deleteSession };
