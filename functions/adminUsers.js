const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { requireAdmin } = require("./adminAuthorization");

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_SEARCH_LENGTH = 100;

const VALID_STATUSES = new Set([
  "all",
  "active",
  "suspended",
]);

// Encode the last displayed user's ID for the next page request.
function encodeCursor(userId) {
  return Buffer.from(
    JSON.stringify({ userId }),
    "utf8",
  ).toString("base64url");
}

// Decode and validate the cursor received from the client.
function decodeCursor(cursor) {
  if (cursor == null || cursor === "") {
    return null;
  }

  if (typeof cursor !== "string" || cursor.length > 512) {
    throw new HttpsError(
      "invalid-argument",
      "The cursor is invalid.",
    );
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    if (
      !decoded ||
      typeof decoded.userId !== "string" ||
      !decoded.userId.trim()
    ) {
      throw new Error("Invalid cursor payload.");
    }

    return decoded.userId;
  } catch {
    throw new HttpsError(
      "invalid-argument",
      "The cursor is invalid.",
    );
  }
}

// Validate the query before reading the user directory.
function validateQuery(data) {
  const query = data == null ? {} : data;

  if (typeof query !== "object" || Array.isArray(query)) {
    throw new HttpsError(
      "invalid-argument",
      "The user query is invalid.",
    );
  }

  const search = query.search == null ? "" : query.search;
  const status = query.status == null ? "all" : query.status;
  const pageSize =
    query.pageSize == null ? DEFAULT_PAGE_SIZE : query.pageSize;

  if (
    typeof search !== "string" ||
    search.length > MAX_SEARCH_LENGTH
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The search value is invalid.",
    );
  }

  if (
    typeof status !== "string" ||
    !VALID_STATUSES.has(status)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The account status is invalid.",
    );
  }

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new HttpsError(
      "invalid-argument",
      `pageSize must be between 1 and ${MAX_PAGE_SIZE}.`,
    );
  }

  return {
    search: search.trim().toLowerCase(),
    status,
    pageSize,
    cursorUserId: decodeCursor(query.cursor),
  };
}

// Convert timestamps to ISO strings for the client.
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

// Firebase Authentication returns users in pages.
// Continue fetching until there are no more Auth pages.
async function listAllAuthUsers(authService) {
  const users = [];
  let pageToken;

  do {
    const page = await authService.listUsers(1000, pageToken);

    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

function createGetUsers({
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

  return async function getUsers(request) {
    // Authorization must happen before any directory data is read.
    await requireAdminDependency(request);

    const query = validateQuery(request?.data);
    const authService = getAuthDependency();
    const db = getDb();

    // Read Auth accounts and Firestore profiles.
    const [authUsers, profileSnapshot] = await Promise.all([
      listAllAuthUsers(authService),
      db.collection("users").get(),
    ]);

    const authByUid = new Map(
      authUsers.map((user) => [user.uid, user]),
    );

    const users = [];

    for (const profileDocument of profileSnapshot.docs) {
      const authUser = authByUid.get(profileDocument.id);

      // Skip profiles without a matching Auth account.
      if (!authUser) {
        continue;
      }

      // Do not display administrator accounts in this directory.
      if (authUser.customClaims?.admin === true) {
        continue;
      }

      const profile = profileDocument.data() || {};

      const fullName =
        typeof profile.fullName === "string"
          ? profile.fullName
          : null;

      // Prefer the current Auth email to avoid showing an old address.
      const email =
        typeof authUser.email === "string" && authUser.email
          ? authUser.email
          : typeof profile.email === "string"
            ? profile.email
            : null;

      // A profile without an Auth account is skipped above.
      // An Auth account without a profile is skipped because there is
      // no matching profile document to process.
      users.push({
        userId: authUser.uid,
        fullName,
        email,
        accountStatus: authUser.disabled
          ? "suspended"
          : "active",
        createdAt: toIsoString(profile.createdAt),
      });
    }

    // Use the same case-sensitive lexical ordering as the cursor comparison.
    users.sort((left, right) => {
      if (left.userId < right.userId) return -1;
      if (left.userId > right.userId) return 1;
      return 0;
    });

    // Apply the selected status and search filters.
    const filteredUsers = users.filter((user) => {
      const matchesStatus =
        query.status === "all" ||
        user.accountStatus === query.status;

      const searchableText =
        `${user.fullName || ""} ${user.email || ""}`.toLowerCase();

      const matchesSearch =
        !query.search ||
        searchableText.includes(query.search);

      return matchesStatus && matchesSearch;
    });

    let startIndex = 0;

    if (query.cursorUserId) {
      // Continue after the cursor, even if that user has since
      // disappeared or no longer matches the selected filters.
      startIndex = filteredUsers.findIndex(
        (user) => user.userId > query.cursorUserId,
      );

      if (startIndex < 0) {
        startIndex = filteredUsers.length;
      }
    }

    const items = filteredUsers.slice(
      startIndex,
      startIndex + query.pageSize,
    );

    const lastItem = items[items.length - 1];

    const nextCursor =
      lastItem &&
      startIndex + items.length < filteredUsers.length
        ? encodeCursor(lastItem.userId)
        : null;

    // Keep the response compatible with AdminUsersScreen.js.
    return {
      items,
      nextCursor,
      total: filteredUsers.length,
    };
  };
}

function createCallableGetUsers({
  requireAdmin: requireAdminDependency,
  getAuth: getAuthDependency = getAuth,
  getDb = getFirestore,
} = {}) {
  const handler = createGetUsers({
    requireAdmin: requireAdminDependency,
    getAuth: getAuthDependency,
    getDb,
  });

  return async function callableGetUsers(request) {
    try {
      return await handler(request);
    } catch (error) {
      // Only expose expected validation and authorization errors.
      // Unexpected failures receive a generic message.
      const safeCodes = new Set([
        "invalid-argument",
        "unauthenticated",
        "permission-denied",
      ]);

      if (
        error instanceof HttpsError &&
        safeCodes.has(error.code)
      ) {
        throw error;
      }

      // Detailed errors stay in the trusted server logs.
      console.error("getUsers failed", error);

      throw new HttpsError(
        "internal",
        "Unable to load the administrator user directory.",
      );
    }
  };
}

// The endpoint is publicly invokable at the infrastructure layer,
// but application-level access is still restricted by requireAdmin.
const getUsers = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  createCallableGetUsers({
    requireAdmin,
  }),
);

module.exports = {
  createGetUsers,
  createCallableGetUsers,
  getUsers,
};
