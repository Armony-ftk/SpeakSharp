
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { FieldPath, getFirestore } = require("firebase-admin/firestore");
const { requireAdmin } = require("./adminAuthorization");

const UNAVAILABLE_STATS = {
  totalUsers: null,
  totalSessions: null,
  totalRecordings: null,
  recentlyActiveUsers: null,
  activityWindowDays: 7,
  recentActivity: null,
};

/**
 * Counts persisted session documents using a server-side aggregation.
 *
 * Assumes the confirmed schema is:
 * users/{uid}/sessions/{sessionId}
 *
 * Collection-group queries match every collection named "sessions".
 * Revisit this query if another unrelated collection with that name
 * is introduced.
 */
function createSessionCountProvider({ getDb = getFirestore } = {}) {
  if (typeof getDb !== "function") {
    throw new TypeError("getDb must be a function.");
  }

  return async function getSessionCount() {
    const db = getDb();

    const aggregate = await db
      .collectionGroup("sessions")
      .count()
      .get();

    return aggregate.data().count;
  };
}

// Match getUsers: a persisted profile with a non-admin Auth account,
// including suspended accounts. Count matching IDs without reading profiles.
async function countRegisteredUsers(db, auth) {
  let total = 0;
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    const userIds = page.users
      .filter((user) => user.customClaims?.admin !== true)
      .map((user) => user.uid);
    const counts = [];

    // Firestore supports at most 30 values in an `in` query.
    for (let offset = 0; offset < userIds.length; offset += 30) {
      counts.push(
        db.collection("users")
          .where(FieldPath.documentId(), "in", userIds.slice(offset, offset + 30))
          .count()
          .get(),
      );
    }

    for (const aggregate of await Promise.all(counts)) {
      total += aggregate.data().count;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return total;
}

function createAdminStatsProvider({
  getDb = getFirestore,
  getAuth: getAuthDependency = getAuth,
  now = Date.now,
} = {}) {
  const getSessionCount = createSessionCountProvider({ getDb });

  return async function getStats() {
    const db = getDb();
    const end = new Date(now());
    const start = new Date(end.getTime() - UNAVAILABLE_STATS.activityWindowDays * 86400000);

    // Requires ascending createdAt single-field indexes with COLLECTION_GROUP
    // scope for sessions and recordings. Only document paths are retrieved;
    // no session text, transcripts, feedback or audio metadata is read.
    const recentDocuments = (collection) => db.collectionGroup(collection)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .select()
      .get();

    const [totalUsers, totalSessions, recordings, sessionsRecent, recordingsRecent] =
      await Promise.all([
        countRegisteredUsers(db, getAuthDependency()),
        getSessionCount(),
        // Like sessions, recordings currently exist only in the canonical
        // users/{uid}/sessions/{sessionId}/recordings/{recordingId} hierarchy.
        db.collectionGroup("recordings").count().get(),
        recentDocuments("sessions"),
        recentDocuments("recordings"),
      ]);

    const activeUserIds = new Set();
    for (const snapshot of [sessionsRecent, recordingsRecent]) {
      for (const document of snapshot.docs) {
        const match = document.ref.path.match(
          /^users\/([^/]+)\/sessions\/[^/]+(?:\/recordings\/[^/]+)?$/,
        );
        if (match) activeUserIds.add(match[1]);
      }
    }

    return {
      totalUsers,
      totalSessions,
      totalRecordings: recordings.data().count,
      recentlyActiveUsers: activeUserIds.size,
    };
  };
}

function createGetAdminStats({
  requireAdmin,
  getStats = async () => ({}),
}) {
  if (typeof requireAdmin !== "function") {
    throw new TypeError("requireAdmin must be a function.");
  }

  if (typeof getStats !== "function") {
    throw new TypeError("getStats must be a function.");
  }

  return async function getAdminStats(request) {
    // Always authorize before retrieving statistics.
    await requireAdmin(request);

    const stats = await getStats();

    return {
      totalUsers: stats?.totalUsers ?? UNAVAILABLE_STATS.totalUsers,
      totalSessions: stats?.totalSessions ?? UNAVAILABLE_STATS.totalSessions,
      totalRecordings:
        stats?.totalRecordings ?? UNAVAILABLE_STATS.totalRecordings,
      recentlyActiveUsers:
        stats?.recentlyActiveUsers ?? UNAVAILABLE_STATS.recentlyActiveUsers,
      activityWindowDays: UNAVAILABLE_STATS.activityWindowDays,
      recentActivity:
        stats?.recentActivity ?? UNAVAILABLE_STATS.recentActivity,
    };
  };
}

function createCallableGetAdminStats({ requireAdmin, getStats }) {
  const handler = createGetAdminStats({
    requireAdmin,
    getStats,
  });

  return async function callableGetAdminStats(request) {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        "internal",
        "Unable to load administrator statistics.",
      );
    }
  };
}

const getAdminStats = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  createCallableGetAdminStats({
    requireAdmin,
    getStats: createAdminStatsProvider(),
  }),
);

module.exports = {
  createSessionCountProvider,
  createAdminStatsProvider,
  createGetAdminStats,
  createCallableGetAdminStats,
  getAdminStats,
};
