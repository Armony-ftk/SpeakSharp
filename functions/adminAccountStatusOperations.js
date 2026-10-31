const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp, getFirestore } = require("firebase-admin/firestore");

const OPERATION_COLLECTION = "adminAccountStatusOperations";
const LOCK_COLLECTION = "adminAccountStatusLocks";
const ACTIVITY_COLLECTION = "adminActivityLogs";
const MAX_OPERATION_ID_LENGTH = 64;
const MAX_USER_ID_LENGTH = 128;

const OPERATION_ID_PATTERN =
  /^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidArgument(message) {
  throw new HttpsError("invalid-argument", message);
}

function validateOperationId(operationId) {
  if (
    typeof operationId !== "string" ||
    operationId.length > MAX_OPERATION_ID_LENGTH ||
    !OPERATION_ID_PATTERN.test(operationId)
  ) {
    invalidArgument("operationId must be an op_-prefixed UUID v4.");
  }

  return operationId;
}

function validateUserId(userId) {
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    userId.length > MAX_USER_ID_LENGTH ||
    userId.includes("/")
  ) {
    invalidArgument("A valid target user ID is required.");
  }

  return userId.trim();
}

function validateBinding({ targetUserId, requestedDisabled, actorId }) {
  return {
    targetUserId: validateUserId(targetUserId),
    requestedDisabled:
      typeof requestedDisabled === "boolean"
        ? requestedDisabled
        : invalidArgument("requestedDisabled must be a boolean."),
    actorId:
      typeof actorId === "string" && actorId.trim()
        ? actorId.trim()
        : invalidArgument("actorId is required."),
  };
}

function operationReference(db, operationId) {
  return db.collection(OPERATION_COLLECTION).doc(operationId);
}

function lockReference(db, targetUserId) {
  return db.collection(LOCK_COLLECTION).doc(targetUserId);
}

function activityReference(db, operationId) {
  return db
    .collection(ACTIVITY_COLLECTION)
    .doc(`admin_status_${operationId}`);
}

const ACCOUNT_STATUS_ACTIVITY_FIELDS = [
  "id",
  "userId",
  "type",
  "action",
  "actorId",
  "status",
  "occurredAt",
  "source",
];

function validateActivity(activity, operationId, binding) {
  if (!activity || typeof activity !== "object") {
    invalidArgument("A valid account-status activity event is required.");
  }

  const actualFields = Object.keys(activity).sort();
  const expectedFields = [...ACCOUNT_STATUS_ACTIVITY_FIELDS].sort();
  if (
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields[index])
  ) {
    invalidArgument("Account-status activity contains unsupported fields.");
  }

  if (
    activity.id !== `admin_status_${operationId}` ||
    activity.userId !== binding.targetUserId ||
    activity.actorId !== binding.actorId ||
    activity.type !== "Admin" ||
    activity.action !== (binding.requestedDisabled ? "suspend" : "reactivate") ||
    activity.status !== "success" ||
    activity.source !== "trusted_function" ||
    !(activity.occurredAt instanceof Timestamp)
  ) {
    invalidArgument("Account-status activity does not match the operation.");
  }

  return activity;
}

function sameActivity(left, right) {
  return ACCOUNT_STATUS_ACTIVITY_FIELDS.every((field) => {
    if (field === "occurredAt") {
      return (
        left?.[field]?.seconds === right?.[field]?.seconds &&
        left?.[field]?.nanoseconds === right?.[field]?.nanoseconds
      );
    }

    return left?.[field] === right?.[field];
  });
}

function isActivityForBinding(activity, operationId, binding) {
  if (!activity || typeof activity !== "object") {
    return false;
  }

  const actualFields = Object.keys(activity).sort();
  const expectedFields = [...ACCOUNT_STATUS_ACTIVITY_FIELDS].sort();

  return (
    actualFields.length === expectedFields.length &&
    actualFields.every((field, index) => field === expectedFields[index]) &&
    activity.id === `admin_status_${operationId}` &&
    activity.userId === binding.targetUserId &&
    activity.actorId === binding.actorId &&
    activity.type === "Admin" &&
    activity.action ===
      (binding.requestedDisabled ? "suspend" : "reactivate") &&
    activity.status === "success" &&
    activity.source === "trusted_function" &&
    activity.occurredAt instanceof Timestamp
  );
}

function assertSameBinding(operation, binding) {
  if (
    operation.targetUserId !== binding.targetUserId ||
    operation.requestedDisabled !== binding.requestedDisabled ||
    operation.actorId !== binding.actorId
  ) {
    throw new HttpsError(
      "permission-denied",
      "The operation ID is already bound to another request.",
    );
  }
}

function validateOperationResult(result, binding, errorCode = "invalid-argument") {
  const expectedFields = ["accountStatus", "updatedAt", "userId"];
  const actualFields = result && typeof result === "object"
    ? Object.keys(result).sort()
    : [];

  if (
    !result ||
    typeof result !== "object" ||
    actualFields.length !== expectedFields.length ||
    actualFields.some((field, index) => field !== expectedFields.sort()[index]) ||
    result.userId !== binding.targetUserId ||
    result.accountStatus !==
      (binding.requestedDisabled ? "suspended" : "active") ||
    typeof result.updatedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      result.updatedAt,
    ) ||
    Number.isNaN(Date.parse(result.updatedAt))
  ) {
    throw new HttpsError(
      errorCode,
      errorCode === "failed-precondition"
        ? "The account-status operation has an invalid stored result."
        : "A valid operation result is required.",
    );
  }

  return result;
}

function createAccountStatusOperationManager({
  getDb = getFirestore,
  now = () => Timestamp.now(),
} = {}) {
  if (typeof getDb !== "function") {
    throw new TypeError("getDb must be a function.");
  }

  if (typeof now !== "function") {
    throw new TypeError("now must be a function.");
  }

  async function claimOperation({
    operationId,
    targetUserId,
    requestedDisabled,
    actorId,
  }) {
    const normalizedOperationId = validateOperationId(operationId);
    const binding = validateBinding({
      targetUserId,
      requestedDisabled,
      actorId,
    });
    const db = getDb();

    return db.runTransaction(async (transaction) => {
      const operationRef = operationReference(db, normalizedOperationId);
      const lockRef = lockReference(db, binding.targetUserId);
      const eventRef = activityReference(db, normalizedOperationId);
      const operationSnapshot = await transaction.get(operationRef);
      const lockSnapshot = await transaction.get(lockRef);
      const eventSnapshot = await transaction.get(eventRef);

      if (operationSnapshot.exists) {
        const operation = operationSnapshot.data() || {};
        assertSameBinding(operation, binding);

        if (operation.status === "completed") {
          if (
            !eventSnapshot.exists ||
            !isActivityForBinding(
              eventSnapshot.data(),
              normalizedOperationId,
              binding,
            )
          ) {
            throw new HttpsError(
              "failed-precondition",
              "The completed operation has an inconsistent activity event.",
            );
          }

          validateOperationResult(operation.result, binding, "failed-precondition");

          return {
            status: "completed",
            result: operation.result || null,
            claimed: false,
          };
        }

        if (
          lockSnapshot.exists &&
          lockSnapshot.data()?.operationId === normalizedOperationId
        ) {
          return {
            status: operation.status,
            result: operation.result || null,
            claimed: false,
          };
        }

        throw new HttpsError(
          "failed-precondition",
          "This operation requires trusted repair before it can continue.",
        );
      }

      if (lockSnapshot.exists) {
        throw new HttpsError(
          "failed-precondition",
          "Another account-status operation is unresolved for this user.",
        );
      }

      const timestamp = now();
      transaction.set(operationRef, {
        operationId: normalizedOperationId,
        ...binding,
        status: "pending",
        stage: "claimed",
        createdAt: timestamp,
        updatedAt: timestamp,
        failureStage: null,
        result: null,
      });
      transaction.set(lockRef, {
        operationId: normalizedOperationId,
        targetUserId: binding.targetUserId,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      });

      return { status: "pending", result: null, claimed: true };
    });
  }

  async function completeOperation({
    operationId,
    targetUserId,
    requestedDisabled,
    actorId,
    result,
    activity,
  }) {
    const normalizedOperationId = validateOperationId(operationId);
    const binding = validateBinding({
      targetUserId,
      requestedDisabled,
      actorId,
    });

    validateOperationResult(result, binding);

    const validatedActivity = validateActivity(
      activity,
      normalizedOperationId,
      binding,
    );

    const db = getDb();

    return db.runTransaction(async (transaction) => {
      const operationRef = operationReference(db, normalizedOperationId);
      const lockRef = lockReference(db, binding.targetUserId);
      const eventRef = activityReference(db, normalizedOperationId);
      const operationSnapshot = await transaction.get(operationRef);
      const lockSnapshot = await transaction.get(lockRef);
      const eventSnapshot = await transaction.get(eventRef);

      if (!operationSnapshot.exists) {
        throw new HttpsError("not-found", "The account-status operation was not found.");
      }

      const operation = operationSnapshot.data() || {};
      assertSameBinding(operation, binding);

      if (operation.status === "completed") {
        if (
          !eventSnapshot.exists ||
          !isActivityForBinding(
            eventSnapshot.data(),
            normalizedOperationId,
            binding,
          ) ||
          !sameActivity(eventSnapshot.data(), validatedActivity)
        ) {
          throw new HttpsError(
            "failed-precondition",
            "The completed operation has an inconsistent activity event.",
          );
        }

        validateOperationResult(operation.result, binding, "failed-precondition");
        return operation.result;
      }

      const lock = lockSnapshot.data() || {};
      if (
        operation.status !== "pending" ||
        !lockSnapshot.exists ||
        lock.operationId !== normalizedOperationId ||
        lock.targetUserId !== binding.targetUserId ||
        lock.status !== "pending"
      ) {
        throw new HttpsError(
          "failed-precondition",
          "The operation requires trusted repair before completion.",
        );
      }

      const timestamp = now();
      transaction.set(operationRef, {
        status: "completed",
        stage: "completed",
        updatedAt: timestamp,
        result,
      }, { merge: true });
      if (
        eventSnapshot.exists &&
        (!isActivityForBinding(
          eventSnapshot.data(),
          normalizedOperationId,
          binding,
        ) || !sameActivity(eventSnapshot.data(), validatedActivity))
      ) {
        throw new HttpsError(
          "failed-precondition",
          "An inconsistent activity event already exists for this operation.",
        );
      }

      transaction.set(eventRef, validatedActivity);
      transaction.delete(lockRef);

      return result;
    });
  }

  return {
    claimOperation,
    completeOperation,
  };
}

module.exports = {
  ACTIVITY_COLLECTION,
  LOCK_COLLECTION,
  OPERATION_COLLECTION,
  createAccountStatusOperationManager,
  validateOperationId,
};
