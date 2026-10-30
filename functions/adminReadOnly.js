const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { requireAdmin } = require("./adminAuthorization");

// Validate the user ID before performing any Auth or Firestore reads.
function validateUserId(userId) {
  if (
    typeof userId !== "string" ||
    !userId.trim() ||
    userId.length > 128 ||
    userId.includes("/")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "A valid user ID is required.",
    );
  }

  return userId.trim();
}

// Convert Firestore timestamps and dates into ISO UTC strings.
function toIsoString(value) {
  if (value == null) {
    return null;
  }

  const date =
    typeof value.toDate === "function"
      ? value.toDate()
      : value instanceof Date
        ? value
        : new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : date.toISOString();
}

// Count persisted sessions for one user.
// Recording counts are not included because the recording schema
// has not yet been confirmed.
async function getSessionCount(db, userId) {
  const aggregate = await db
    .collection("users")
    .doc(userId)
    .collection("sessions")
    .count()
    .get();

  return aggregate.data().count;
}

function createGetUserDetails({
  requireAdmin: requireAdminDependency,
  getAuth: getAuthDependency = getAuth,
  getDb = getFirestore,
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

  return async function getUserDetails(request) {
    // 1. Authorize the caller before accessing protected data.
    await requireAdminDependency(request);

    // 2. Validate the requested ID before initializing Auth or Firestore.
    const userId = validateUserId(request?.data?.userId);

    // 3. Retrieve the current Firebase Authentication record.
    const authService = getAuthDependency();

    let authUser;

    try {
      authUser = await authService.getUser(userId);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError(
          "not-found",
          "User not found.",
        );
      }

      // Unexpected Auth failures are handled by the callable wrapper.
      throw error;
    }

    // 4. Do not expose administrator accounts as ordinary user details.
    // Do this before initializing or reading Firestore.
    if (authUser.customClaims?.admin === true) {
      throw new HttpsError(
        "not-found",
        "User not found.",
      );
    }

    // 5. Only initialize Firestore after the Auth account has been checked.
    const db = getDb();

    // 6. Read the user's confirmed profile document.
    const profileSnapshot = await db
      .collection("users")
      .doc(userId)
      .get();

    if (!profileSnapshot.exists) {
      throw new HttpsError(
        "not-found",
        "User profile not found.",
      );
    }

    const profile = profileSnapshot.data() || {};

    // 7. Count persisted sessions using the confirmed collection path.
    const totalSessions = await getSessionCount(db, userId);

    // Prefer the current Auth email in case the profile is outdated.
    const email =
      typeof authUser.email === "string" && authUser.email
        ? authUser.email
        : typeof profile.email === "string"
          ? profile.email
          : null;

    // 8. Return metadata only. Recording details and trusted activity
    // sources have not yet been confirmed.
    return {
      userId,
      fullName:
        typeof profile.fullName === "string"
          ? profile.fullName
          : null,
      email,
      accountStatus: authUser.disabled
        ? "suspended"
        : "active",
      createdAt: toIsoString(profile.createdAt),
      totalSessions,
      totalRecordings: null,
      recentActivity: null,
    };
  };
}

function createCallableGetUserDetails({
  requireAdmin: requireAdminDependency,
  getAuth: getAuthDependency = getAuth,
  getDb = getFirestore,
} = {}) {
  const handler = createGetUserDetails({
    requireAdmin: requireAdminDependency,
    getAuth: getAuthDependency,
    getDb,
  });

  return async function callableGetUserDetails(request) {
    try {
      return await handler(request);
    } catch (error) {
      // Preserve expected validation, authorization and not-found errors.
      const safeCodes = new Set([
        "invalid-argument",
        "unauthenticated",
        "permission-denied",
        "not-found",
      ]);

      if (
        error instanceof HttpsError &&
        safeCodes.has(error.code)
      ) {
        throw error;
      }

      // Keep diagnostic details in trusted server logs only.
      console.error("getUserDetails failed", error);

      throw new HttpsError(
        "internal",
        "Unable to load user details.",
      );
    }
  };
}

// Infrastructure-level invocation is public, but the handler requires
// valid administrator authorization before reading protected data.
const getUserDetails = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  createCallableGetUserDetails({
    requireAdmin,
  }),
);

module.exports = {
  createGetUserDetails,
  createCallableGetUserDetails,
  getUserDetails,
};
