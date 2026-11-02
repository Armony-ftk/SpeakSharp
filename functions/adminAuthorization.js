
const { getAuth } = require("firebase-admin/auth");
const { HttpsError } = require("firebase-functions/v2/https");

function createRequireAdmin({ getAuth: getAuthDependency = getAuth } = {}) {
  return async function requireAdmin(request) {
    // 1. Check that the request comes from an authenticated user.
    if (!request?.auth?.uid) {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    }

    // 2. Check the admin claim supplied in the verified Firebase token.
    if (request.auth.token?.admin !== true) {
      throw new HttpsError(
        "permission-denied",
        "Admin access is required.",
      );
    }

    // 3. Check the user's current Firebase Authentication record.
    let record;

    try {
      record = await getAuthDependency().getUser(request.auth.uid);
    } catch (error) {
      if (error?.code === "auth/user-not-found") {
        throw new HttpsError(
          "permission-denied",
          "Admin access is revoked.",
        );
      }

      throw new HttpsError(
        "internal",
        "Admin access could not be verified.",
      );
    }

    // 4. Reject unverified, disabled accounts and removed admin claims.
    if (
      record.emailVerified !== true ||
      record.disabled ||
      record.customClaims?.admin !== true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Admin access is revoked.",
      );
    }

    // Return only the minimum information needed by future admin functions.
    return { uid: record.uid };
  };
}

const requireAdmin = createRequireAdmin();

module.exports = { createRequireAdmin, requireAdmin };
