
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
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

const getSessionCount = createSessionCountProvider();

const getAdminStats = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  createCallableGetAdminStats({
    requireAdmin,
    getStats: async () => ({
      totalSessions: await getSessionCount(),
    }),
  }),
);

module.exports = {
  createSessionCountProvider,
  createGetAdminStats,
  createCallableGetAdminStats,
  getAdminStats,
};
