
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");

const {
  createSessionCountProvider,
  createAdminStatsProvider,
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

// Deliberately supports only aggregations and empty field projections, so an
// accidental full collection/document read fails these provider tests.
function statsDependencies({ failQuery, authPages = [{ users: [] }] } = {}) {
  const calls = [];
  function query(name, filters = []) {
    return {
      where(field, operator, value) {
        return query(name, [...filters, [String(field), operator, value]]);
      },
      count() {
        return { get: async () => {
          calls.push([name, "count", filters]);
          if (failQuery === `${name}:count`) throw new Error("private query details");
          return { data: () => ({ count: name === "users" ? filters[0][2].length : 0 }) };
        } };
      },
      select(...fields) {
        assert.deepEqual(fields, []);
        return { get: async () => {
          calls.push([name, "select", filters]);
          if (failQuery === `${name}:select`) throw new Error("private query details");
          return { docs: [] };
        } };
      },
    };
  }
  return {
    calls,
    now: () => Date.parse("2026-11-01T12:00:00Z"),
    getDb: () => ({ collection: query, collectionGroup: query }),
    getAuth: () => ({ listUsers: async (size, token) => {
      assert.equal(size, 1000);
      if (failQuery === "auth") throw new Error("private auth details");
      calls.push(["auth", token]);
      return authPages[token ? Number(token) : 0];
    } }),
  };
}

test("stats uses every Auth page, skips admins, and batches profile counts within the in-query limit", async () => {
  const dependencies = statsDependencies({ authPages: [
    { users: [
      { uid: "admin", customClaims: { admin: true } },
      ...Array.from({ length: 31 }, (_, i) => ({ uid: `user-${i}` })),
    ], pageToken: "1" },
    { users: [{ uid: "suspended", disabled: true }] },
  ] });
  const result = await createAdminStatsProvider(dependencies)();
  assert.equal(result.totalUsers, 32);
  const profileCounts = dependencies.calls.filter(([name]) => name === "users");
  assert.deepEqual(profileCounts.map(([, , filters]) => filters[0][2].length), [30, 1, 1]);
  assert.ok(profileCounts.every(([, , filters]) =>
    filters[0][0] === "__name__" && filters[0][1] === "in" && !filters[0][2].includes("admin")));
  assert.deepEqual(dependencies.calls.filter(([name]) => name === "auth"), [["auth", undefined], ["auth", "1"]]);
});

test("stats returns real zeros and requests only paths within the fixed seven-day window", async () => {
  const dependencies = statsDependencies();
  const handler = createCallableGetAdminStats({
    requireAdmin: async () => {},
    getStats: createAdminStatsProvider(dependencies),
  });
  assert.deepEqual(await handler({}), {
    totalUsers: 0, totalSessions: 0, totalRecordings: 0,
    recentlyActiveUsers: 0, activityWindowDays: 7, recentActivity: null,
  });
  const recentQueries = dependencies.calls.filter(([, operation]) => operation === "select");
  assert.deepEqual(recentQueries.map(([name]) => name), ["sessions", "recordings"]);
  for (const [, , filters] of recentQueries) {
    assert.deepEqual(filters, [
      ["createdAt", ">=", new Date("2026-10-25T12:00:00Z")],
      ["createdAt", "<=", new Date("2026-11-01T12:00:00Z")],
    ]);
  }
});

for (const failQuery of ["auth", "users:count", "sessions:count", "recordings:count", "sessions:select", "recordings:select"]) {
  test(`stats propagates ${failQuery} failures without returning zero or private details`, async () => {
    const handler = createCallableGetAdminStats({
      requireAdmin: async () => {},
      getStats: createAdminStatsProvider(statsDependencies({
        failQuery, authPages: [{ users: [{ uid: "user" }] }],
      })),
    });
    await assert.rejects(handler({}), {
      code: "internal", message: "Unable to load administrator statistics.",
    });
  });
}
