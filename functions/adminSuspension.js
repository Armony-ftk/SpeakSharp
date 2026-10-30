const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { Timestamp, getFirestore } = require("firebase-admin/firestore");
const { requireAdmin } = require("./adminAuthorization");
const {
  createAccountStatusOperationManager,
  validateOperationId,
} = require("./adminAccountStatusOperations");

const MAX_USER_ID_LENGTH = 128;

function validateUserId(userId) {
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    userId.length > MAX_USER_ID_LENGTH ||
    userId.includes("/")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A valid user ID is required.",
    );
  }

  return userId.trim();
}

function validateDisabled(disabled) {
  if (typeof disabled !== "boolean") {
    throw new HttpsError(
      "invalid-argument",
      "disabled must be a boolean.",
    );
  }

  return disabled;
}

function createSetUserDisabled({
  requireAdmin: requireAdminDependency,
  getAuth: getAuthDependency = getAuth,
  getDb = getFirestore,
  now = () => new Date().toISOString(),
  operationManager: operationManagerDependency,
} = {}) {
  if (typeof requireAdminDependency !== "function") {
    throw new TypeError("requireAdmin must be a function.");
  }

  if (typeof getAuthDependency !== "function") {
    throw new TypeError("getAuth must be a function.");
  }

  if (typeof getDb !== "function") {
    throw new TypeError("getDb must be a function.");
  }

  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  const operationManager =
    operationManagerDependency || createAccountStatusOperationManager({ getDb });

  return async function setUserDisabled(request) {
    const operator = await requireAdminDependency(request);
    const userId = validateUserId(request?.data?.userId);
    const disabled = validateDisabled(request?.data?.disabled);
    const operationId = validateOperationId(request?.data?.operationId);

    const authService = getAuthDependency();
    let targetUser;

    try {
      targetUser = await authService.getUser(userId);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "User not found.");
      }

      throw error;
    }

    if (operator?.uid === targetUser.uid) {
      throw new HttpsError(
        "permission-denied",
        "Administrators cannot change their own account status.",
      );
    }

    if (targetUser.customClaims?.admin === true) {
      throw new HttpsError(
        "permission-denied",
        "Administrator accounts cannot be changed.",
      );
    }

    const db = getDb();
    const profileRef = db.collection("users").doc(userId);
    const profileSnapshot = await profileRef.get();

    if (!profileSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "User profile not found.",
      );
    }

    const verifyFinalState = async () => {
      let verifiedAuthUser;
      let verifiedProfileSnapshot;

      try {
        verifiedAuthUser = await authService.getUser(userId);
        verifiedProfileSnapshot = await profileRef.get();
      } catch (error) {
        console.error("setUserDisabled failed", {
          stage: "final-state-verification",
          userId,
          error,
        });
        throw new HttpsError(
          "internal",
          "Unable to confirm account status.",
        );
      }

      if (
        !verifiedProfileSnapshot.exists ||
        verifiedAuthUser.disabled !== disabled ||
        verifiedProfileSnapshot.data()?.disabled !== disabled
      ) {
        console.error("setUserDisabled failed", {
          stage: "final-state-verification",
          userId,
        });
        throw new HttpsError(
          "internal",
          "Unable to confirm account status.",
        );
      }
    };

    const operationClaim = await operationManager.claimOperation({
      operationId,
      targetUserId: userId,
      requestedDisabled: disabled,
      actorId: operator.uid,
    });

    if (operationClaim.status === "completed") {
      if (!operationClaim.result) {
        throw new HttpsError(
          "internal",
          "Unable to confirm account status.",
        );
      }

      await verifyFinalState();
      return operationClaim.result;
    }

    if (operationClaim.claimed !== true) {
      throw new HttpsError(
        "failed-precondition",
        "This operation is already in progress and requires trusted recovery if unresolved.",
      );
    }

    const updateMirror = async (value, stage) => {
      try {
        await profileRef.update({ disabled: value });
      } catch (error) {
        console.error("setUserDisabled failed", {
          stage,
          userId,
          error,
        });
        throw new HttpsError(
          "internal",
          "Unable to update account status.",
        );
      }
    };

    if (disabled) {
      await updateMirror(true, "firestore-suspension-mirror");

      try {
        await authService.updateUser(userId, { disabled: true });
      } catch (error) {
        console.error("setUserDisabled failed", {
          stage: "auth-disable",
          userId,
          error,
        });
        throw new HttpsError(
          "internal",
          "Unable to update account status.",
        );
      }

      try {
        await authService.revokeRefreshTokens(userId);
      } catch (error) {
        console.error("setUserDisabled failed", {
          stage: "auth-revoke-refresh-tokens",
          userId,
          error,
        });
        throw new HttpsError(
          "internal",
          "Unable to update account status.",
        );
      }
    } else {
      try {
        await authService.updateUser(userId, { disabled: false });
      } catch (error) {
        console.error("setUserDisabled failed", {
          stage: "auth-enable",
          userId,
          error,
        });
        throw new HttpsError(
          "internal",
          "Unable to update account status.",
        );
      }

      await updateMirror(false, "firestore-reactivation-mirror");
    }

    await verifyFinalState();

    const result = {
      userId,
      accountStatus: disabled ? "suspended" : "active",
      updatedAt: now(),
    };

    const activity = {
      id: `admin_status_${operationId}`,
      userId,
      type: "Admin",
      action: disabled ? "suspend" : "reactivate",
      actorId: operator.uid,
      status: "success",
      occurredAt: Timestamp.now(),
      source: "trusted_function",
    };

    try {
      await operationManager.completeOperation({
        operationId,
        targetUserId: userId,
        requestedDisabled: disabled,
        actorId: operator.uid,
        result,
        activity,
      });
    } catch (error) {
      console.error("setUserDisabled failed", {
        stage: "operation-completion",
        userId,
        error,
      });
      throw error instanceof HttpsError
        ? error
        : new HttpsError(
            "internal",
            "Unable to confirm account status.",
          );
    }

    return result;
  };
}

function createCallableSetUserDisabled({
  requireAdmin: requireAdminDependency,
  getAuth: getAuthDependency = getAuth,
  getDb = getFirestore,
  now,
  operationManager,
} = {}) {
  const handler = createSetUserDisabled({
    requireAdmin: requireAdminDependency,
    getAuth: getAuthDependency,
    getDb,
    now,
    operationManager,
  });

  return async function callableSetUserDisabled(request) {
    try {
      return await handler(request);
    } catch (error) {
      const safeCodes = new Set([
        "invalid-argument",
        "unauthenticated",
        "permission-denied",
        "not-found",
        "failed-precondition",
      ]);

      if (error instanceof HttpsError && safeCodes.has(error.code)) {
        throw error;
      }

      console.error("setUserDisabled failed", error);

      throw new HttpsError(
        "internal",
        "Unable to update account status.",
      );
    }
  };
}

const setUserDisabled = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  createCallableSetUserDisabled({
    requireAdmin,
  }),
);

module.exports = {
  createSetUserDisabled,
  createCallableSetUserDisabled,
  setUserDisabled,
};
