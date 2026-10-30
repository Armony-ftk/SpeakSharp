
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");

const {
  createSessionCountProvider,
  createGetAdminStats,
  createCallableGetAdminStats,
} = require("./admin");

function unauthenticatedError() {
  return new HttpsError("unauthenticated", "Authentication required");
}

function permissionDeniedError() {
  return new HttpsError("permission-denied", "Admin access required");
}

test("rejects the request before retrieving statistics if authorization fails", async () => {
  let statsProviderCalled = false;

  const getAdminStats = createGetAdminStats({
    requireAdmin: async () => {
      throw new Error("Access denied");
    },
    getStats: async () => {
      statsProviderCalled = true;
      return { totalUsers: 10 };
    },
  });

  await assert.rejects(
    getAdminStats({ auth: null }),
    /Access denied/,
  );

  assert.equal(statsProviderCalled, false);
});

test("checks authorization before calling the statistics provider", async () => {
  const callOrder = [];

  const getAdminStats = createGetAdminStats({
    requireAdmin: async () => {
      callOrder.push("authorize");
    },
    getStats: async () => {
      callOrder.push("statistics");
      return { totalUsers: 10 };
    },
  });

  const result = await getAdminStats({
    auth: { uid: "test-admin" },
  });

  assert.deepEqual(callOrder, ["authorize", "statistics"]);
  assert.equal(result.totalUsers, 10);
});

test("returns null for unavailable metrics", async () => {
  const getAdminStats = createGetAdminStats({
    requireAdmin: async () => {},
    getStats: async () => ({}),
  });

  const result = await getAdminStats({});

  assert.deepEqual(result, {
    totalUsers: null,
    totalSessions: null,
    totalRecordings: null,
    recentlyActiveUsers: null,
    activityWindowDays: 7,
    recentActivity: null,
  });
});

test("preserves supplied statistics and keeps the seven-day window fixed", async () => {
  const recentActivity = [
    { id: "test-event", label: "Test event" },
  ];

  const getAdminStats = createGetAdminStats({
    requireAdmin: async () => {},
    getStats: async () => ({
      totalUsers: 12,
      totalSessions: 30,
      totalRecordings: null,
      recentlyActiveUsers: null,
      activityWindowDays: 99,
      recentActivity,
    }),
  });

  const result = await getAdminStats({});

  assert.deepEqual(result, {
    totalUsers: 12,
    totalSessions: 30,
    totalRecordings: null,
    recentlyActiveUsers: null,
    activityWindowDays: 7,
    recentActivity,
  });
});

test("does not hide statistics provider errors", async () => {
  const getAdminStats = createGetAdminStats({
    requireAdmin: async () => {},
    getStats: async () => {
      throw new Error("Statistics provider failed");
    },
  });

  await assert.rejects(
    getAdminStats({}),
    /Statistics provider failed/,
  );
});

test("counts persisted session documents through a Firestore aggregation", async () => {
  const calls = [];

  const provider = createSessionCountProvider({
    getDb: () => ({
      collectionGroup(collectionName) {
        calls.push(["collectionGroup", collectionName]);

        return {
          count() {
            calls.push(["count"]);

            return {
              async get() {
                calls.push(["get"]);
                return {
                  data: () => ({ count: 42 }),
                };
              },
            };
          },
        };
      },
    }),
  });

  const result = await provider();

  assert.equal(result, 42);
  assert.deepEqual(calls, [
    ["collectionGroup", "sessions"],
    ["count"],
    ["get"],
  ]);
});

test("callable authorization happens before the statistics provider", async () => {
  const calls = [];

  const getAdminStats = createCallableGetAdminStats({
    requireAdmin: async () => {
      calls.push("authorize");
      throw permissionDeniedError();
    },
    getStats: async () => {
      calls.push("statistics");
      return { totalSessions: 10 };
    },
  });

  await assert.rejects(
    getAdminStats({ auth: { uid: "non-admin" } }),
    (error) => error.code === "permission-denied",
  );

  assert.deepEqual(calls, ["authorize"]);
});

test("callable rejects missing authentication with unauthenticated", async () => {
  const getAdminStats = createCallableGetAdminStats({
    requireAdmin: async (request) => {
      if (!request.auth) {
        throw unauthenticatedError();
      }
    },
    getStats: async () => ({ totalSessions: 10 }),
  });

  await assert.rejects(
    getAdminStats({ auth: null }),
    (error) => error.code === "unauthenticated",
  );
});

test("callable rejects authenticated non-admin users with permission-denied", async () => {
  const getAdminStats = createCallableGetAdminStats({
    requireAdmin: async (request) => {
      if (request.auth?.token?.admin !== true) {
        throw permissionDeniedError();
      }
    },
    getStats: async () => ({ totalSessions: 10 }),
  });

  await assert.rejects(
    getAdminStats({
      auth: {
        uid: "non-admin",
        token: { admin: false },
      },
    }),
    (error) => error.code === "permission-denied",
  );
});

test("callable returns the response contract with unavailable metrics as null", async () => {
  const getAdminStats = createCallableGetAdminStats({
    requireAdmin: async () => {},
    getStats: async () => ({ totalSessions: 42 }),
  });

  const result = await getAdminStats({
    auth: {
      uid: "test-admin",
      token: { admin: true },
    },
  });

  assert.deepEqual(result, {
    totalUsers: null,
    totalSessions: 42,
    totalRecordings: null,
    recentlyActiveUsers: null,
    activityWindowDays: 7,
    recentActivity: null,
  });
});

test("callable maps unexpected provider errors to a generic internal error", async () => {
  const getAdminStats = createCallableGetAdminStats({
    requireAdmin: async () => {},
    getStats: async () => {
      throw new Error("private provider details");
    },
  });

  await assert.rejects(
    getAdminStats({
      auth: {
        uid: "test-admin",
        token: { admin: true },
      },
    }),
    (error) =>
      error.code === "internal" &&
      error.message === "Unable to load administrator statistics.",
  );
});
