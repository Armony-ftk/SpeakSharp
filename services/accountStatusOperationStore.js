const OPERATION_ID_PATTERN =
  /^op_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STORAGE_KEY_PREFIX = "speaksharp:account-status-operation:";

function getDefaultStorage() {
  const storageModule = require("@react-native-async-storage/async-storage");
  return storageModule.default ?? storageModule;
}

function assertUserId(userId) {
  if (
    typeof userId !== "string" ||
    userId.length === 0 ||
    userId.length > 128 ||
    userId.includes("/")
  ) {
    throw new TypeError("userId must be a valid user identifier.");
  }
}

function assertOperationAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") {
    throw new TypeError("An account-status operation is required.");
  }

  const keys = Object.keys(attempt).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "operationId" ||
    keys[1] !== "requestedDisabled" ||
    keys[2] !== "userId"
  ) {
    throw new TypeError("The stored account-status operation is invalid.");
  }

  if (
    typeof attempt.operationId !== "string" ||
    !OPERATION_ID_PATTERN.test(attempt.operationId)
  ) {
    throw new TypeError("The stored account-status operation is invalid.");
  }

  assertUserId(attempt.userId);

  if (typeof attempt.requestedDisabled !== "boolean") {
    throw new TypeError("The stored account-status operation is invalid.");
  }
}

function getStorageKey(userId) {
  assertUserId(userId);
  return `${STORAGE_KEY_PREFIX}${encodeURIComponent(userId)}`;
}

function createAccountStatusOperationStore({ storage = getDefaultStorage() } = {}) {
  if (
    !storage ||
    typeof storage.getItem !== "function" ||
    typeof storage.setItem !== "function" ||
    typeof storage.removeItem !== "function"
  ) {
    throw new TypeError("storage must implement getItem, setItem, and removeItem.");
  }

  return {
    async load(userId) {
      const raw = await storage.getItem(getStorageKey(userId));
      if (raw == null) {
        return null;
      }

      let attempt;
      try {
        attempt = JSON.parse(raw);
      } catch {
        throw new Error("The stored account-status operation is invalid.");
      }

      assertOperationAttempt(attempt);
      if (attempt.userId !== userId) {
        throw new Error("The stored account-status operation is invalid.");
      }

      return attempt;
    },

    async save(attempt) {
      assertOperationAttempt(attempt);
      await storage.setItem(
        getStorageKey(attempt.userId),
        JSON.stringify({
          operationId: attempt.operationId,
          userId: attempt.userId,
          requestedDisabled: attempt.requestedDisabled,
        }),
      );
    },

    async clear(userId) {
      await storage.removeItem(getStorageKey(userId));
    },
  };
}

module.exports = {
  createAccountStatusOperationStore,
  getStorageKey,
};
