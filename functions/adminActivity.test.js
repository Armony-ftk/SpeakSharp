const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("firebase-admin/firestore");

const {
  createCallableGetActivityLogs,
  createFirestoreActivityPageProvider,
  createGetActivityLogs,
  createSessionCreatedHandler,
} = require("./adminActivity");

function createQueryBuilder(docs) {
  const calls = [];

  const query = {
    where(...args) {
      calls.push(["where", ...args]);
      return query;
    },

    orderBy(...args) {
      calls.push(["orderBy", ...args]);
      return query;
    },

    startAfter(...args) {
      calls.push(["startAfter", ...args]);
      return query;
    },

    limit(value) {
      calls.push(["limit", value]);
      return query;
    },

    async get() {
      calls.push(["get"]);
      return { docs };
    },
  };

  return { query, calls };
}

function createActivityDocument(id, data) {
  return {
    id,
    data: () => data,
  };
}

test("authorizes before reading activity records", async () => {
  const calls = [];

  const getActivityLogs = createGetActivityLogs({
    requireAdmin: async () => {
      calls.push("authorize");
    },

    readActivityPage: async () => {
      calls.push("read");

      return {
        events: [],
        nextCursor: null,
      };
    },
  });

  await getActivityLogs({ data: {} });

  assert.deepEqual(calls, ["authorize", "read"]);
});

test("preserves unauthenticated and permission-denied errors", async () => {
  for (const code of ["unauthenticated", "permission-denied"]) {
    const getActivityLogs = createGetActivityLogs({
      requireAdmin: async () => {
        throw new HttpsError(code, "Access denied.");
      },

      readActivityPage: async () => {
        throw new Error("Activity data must not be read.");
      },
    });

    await assert.rejects(
      getActivityLogs({ data: {} }),
      (error) => error.code === code,
    );
  }
});

test("rejects malformed query values before reading activity records", async () => {
  let readCount = 0;

  const getActivityLogs = createGetActivityLogs({
    requireAdmin: async () => {},

    readActivityPage: async () => {
      readCount += 1;

      return {
        events: [],
        nextCursor: null,
      };
    },
  });

  await assert.rejects(
    getActivityLogs({ data: { type: "unknown" } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getActivityLogs({ data: { type: "constructor" } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getActivityLogs({ data: { type: "toString" } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getActivityLogs({ data: { userId: "users/user-1" } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getActivityLogs({ data: { pageSize: 0 } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getActivityLogs({ data: { pageSize: 51 } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getActivityLogs({ data: { cursor: "invalid" } }),
    (error) => error.code === "invalid-argument",
  );

  assert.equal(readCount, 0);
});

test("the errors filter uses status failed, not an event type", async () => {
  let receivedQuery;

  const getActivityLogs = createGetActivityLogs({
    requireAdmin: async () => {},

    readActivityPage: async (query) => {
      receivedQuery = query;

      return {
        events: [],
        nextCursor: null,
      };
    },
  });

  await getActivityLogs({
    data: { type: "errors" },
  });

  assert.equal(receivedQuery.status, "failed");
  assert.equal(receivedQuery.typeValues, undefined);
});

test("the provider applies user and session-type filters", async () => {
  const { query, calls } = createQueryBuilder([]);

  const readActivityPage = createFirestoreActivityPageProvider({
    getDb: () => ({
      collection: (name) => {
        assert.equal(name, "adminActivityLogs");
        return query;
      },
    }),
  });

  await readActivityPage({
    userId: "user-1",
    typeValues: ["session_created"],
    pageSize: 20,
    cursor: null,
  });

  assert.deepEqual(calls, [
    ["where", "userId", "==", "user-1"],
    ["where", "type", "==", "session_created"],
    ["orderBy", "occurredAt", "desc"],
    ["orderBy", "id", "desc"],
    ["limit", 21],
    ["get"],
  ]);
});

test("the provider applies the failed-status filter", async () => {
  const { query, calls } = createQueryBuilder([]);

  const readActivityPage = createFirestoreActivityPageProvider({
    getDb: () => ({
      collection: () => query,
    }),
  });

  await readActivityPage({
    status: "failed",
    pageSize: 20,
    cursor: null,
  });

  assert.deepEqual(calls, [
    ["where", "status", "==", "failed"],
    ["orderBy", "occurredAt", "desc"],
    ["orderBy", "id", "desc"],
    ["limit", 21],
    ["get"],
  ]);
});

test("the provider orders and serializes an activity page", async () => {
  const firstTimestamp = new Timestamp(200, 20);
  const secondTimestamp = new Timestamp(200, 10);

  const docs = [
    createActivityDocument("event-2", {
      userId: "user-2",
      userName: "Daniel P.",
      type: "session_created",
      label: "Created a practice session",
      status: "success",
      occurredAt: firstTimestamp,
    }),

    createActivityDocument("event-1", {
      userId: "user-1",
      userName: "Amina D.",
      type: "session_created",
      label: "Created a practice session",
      status: "success",
      occurredAt: secondTimestamp,
    }),

    createActivityDocument("event-0", {
      userId: "user-1",
      userName: null,
      type: "session_created",
      label: "Created a practice session",
      status: "success",
      occurredAt: secondTimestamp,
    }),
  ];

  const { query, calls } = createQueryBuilder(docs);

  const readActivityPage = createFirestoreActivityPageProvider({
    getDb: () => ({
      collection: () => query,
    }),
  });

  const result = await readActivityPage({
    pageSize: 2,
    cursor: null,
  });

  assert.deepEqual(
    result.events.map((event) => event.id),
    ["event-2", "event-1"],
  );

  assert.equal(
    result.events[0].occurredAt,
    firstTimestamp.toDate().toISOString(),
  );

  assert.ok(result.nextCursor);

  // The provider must request a stable newest-first order and one extra
  // document to determine whether another page exists.
  assert.deepEqual(calls, [
    ["orderBy", "occurredAt", "desc"],
    ["orderBy", "id", "desc"],
    ["limit", 3],
    ["get"],
  ]);
});

test("the serializer exposes only allowlisted admin actions", async () => {
  const timestamp = new Timestamp(400, 20);
  const docs = [
    createActivityDocument("reactivation", {
      userId: "user-1",
      userName: "Amina D.",
      type: "Admin",
      action: "reactivate",
      actorId: "admin-1",
      source: "trusted_function",
      status: "success",
      occurredAt: timestamp,
    }),
    createActivityDocument("suspension", {
      userId: "user-2",
      userName: "Daniel P.",
      type: "Admin",
      action: "suspend",
      actorId: "admin-1",
      source: "trusted_function",
      status: "success",
      occurredAt: timestamp,
    }),
    createActivityDocument("unexpected-admin-action", {
      userId: "user-3",
      userName: "User Three",
      type: "Admin",
      action: "delete",
      actorId: "admin-1",
      source: "trusted_function",
      status: "success",
      occurredAt: timestamp,
    }),
    createActivityDocument("session", {
      userId: "user-4",
      userName: "User Four",
      type: "session_created",
      action: "suspend",
      source: "trusted_function",
      label: "Created a practice session",
      status: "success",
      occurredAt: timestamp,
    }),
  ];

  const { query } = createQueryBuilder(docs);
  const readActivityPage = createFirestoreActivityPageProvider({
    getDb: () => ({ collection: () => query }),
  });

  const result = await readActivityPage({
    pageSize: 10,
    cursor: null,
  });

  assert.equal(result.events[0].action, "reactivate");
  assert.equal(result.events[1].action, "suspend");
  assert.equal(Object.hasOwn(result.events[2], "action"), false);
  assert.equal(Object.hasOwn(result.events[3], "action"), false);

  for (const event of result.events) {
    assert.equal(Object.hasOwn(event, "actorId"), false);
    assert.equal(Object.hasOwn(event, "source"), false);
  }
});

test("the provider preserves exact cursor timestamp precision and ID", async () => {
  const { query, calls } = createQueryBuilder([]);

  const readActivityPage = createFirestoreActivityPageProvider({
    getDb: () => ({
      collection: () => query,
    }),
  });

  await readActivityPage({
    pageSize: 20,
    cursor: {
      seconds: 123456789,
      nanoseconds: 987654321,
      id: "event-1",
    },
  });

  const startAfterCall = calls.find(
    ([name]) => name === "startAfter",
  );

  assert.ok(startAfterCall);
  assert.equal(startAfterCall[1].seconds, 123456789);
  assert.equal(startAfterCall[1].nanoseconds, 987654321);
  assert.equal(startAfterCall[2], "event-1");
});

test("the provider requests pageSize plus one", async () => {
  const { query, calls } = createQueryBuilder([]);

  const readActivityPage = createFirestoreActivityPageProvider({
    getDb: () => ({
      collection: () => query,
    }),
  });

  await readActivityPage({
    pageSize: 7,
    cursor: null,
  });

  assert.deepEqual(
    calls.find(([name]) => name === "limit"),
    ["limit", 8],
  );
});

test("unexpected callable failures become generic internal errors", async () => {
  const originalError = new Error("private Firestore detail");
  const originalConsoleError = console.error;
  const logged = [];

  console.error = (...args) => {
    logged.push(args);
  };

  try {
    const callable = createCallableGetActivityLogs({
      requireAdmin: async () => {},

      readActivityPage: async () => {
        throw originalError;
      },
    });

    await assert.rejects(
      callable({ data: {} }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes(
          "private Firestore detail",
        ),
    );

    assert.equal(logged.length, 1);
    assert.equal(logged[0][1], originalError);
  } finally {
    console.error = originalConsoleError;
  }
});

test("the session trigger reads the profile and writes the activity path", async () => {
  const storedEvents = new Map();
  const profileReads = [];
  const activityWrites = [];

  const db = {
    collection(name) {
      if (name === "users") {
        return {
          doc(userId) {
            profileReads.push([name, userId]);

            return {
              get: async () => ({
                exists: true,

                data: () => ({
                  fullName: "Amina D.",
                }),
              }),
            };
          },
        };
      }

      if (name === "adminActivityLogs") {
        return {
          doc(eventId) {
            activityWrites.push([name, eventId]);

            return {
              set: async (data) => {
                storedEvents.set(eventId, data);
              },
            };
          },
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  const recordSessionCreated = createSessionCreatedHandler({
    getDb: () => db,
    getOccurredAt: () => new Timestamp(300, 123456789),
  });

  const event = {
    params: {
      userId: "user-1",
      sessionId: "session-1",
    },
  };

  await recordSessionCreated(event);
  await recordSessionCreated(event);

  assert.deepEqual(profileReads, [
    ["users", "user-1"],
    ["users", "user-1"],
  ]);

  assert.deepEqual(activityWrites, [
    [
      "adminActivityLogs",
      "session_created_user-1_session-1",
    ],
    [
      "adminActivityLogs",
      "session_created_user-1_session-1",
    ],
  ]);

  // Repeated delivery uses the same document ID instead of creating
  // duplicate activity documents.
  assert.equal(storedEvents.size, 1);

  const stored = storedEvents.get(
    "session_created_user-1_session-1",
  );

  assert.equal(stored.userId, "user-1");
  assert.equal(stored.userName, "Amina D.");
  assert.equal(stored.type, "session_created");
  assert.equal(stored.occurredAt.seconds, 300);
  assert.equal(stored.occurredAt.nanoseconds, 123456789);

  assert.equal(Object.hasOwn(stored, "transcript"), false);
  assert.equal(Object.hasOwn(stored, "audioUrl"), false);
  assert.equal(Object.hasOwn(stored, "feedback"), false);
});

test("the session trigger handles a missing profile", async () => {
  let writtenEvent;

  const db = {
    collection(name) {
      if (name === "users") {
        return {
          doc: () => ({
            get: async () => ({
              exists: false,
              data: () => undefined,
            }),
          }),
        };
      }

      if (name === "adminActivityLogs") {
        return {
          doc: () => ({
            set: async (data) => {
              writtenEvent = data;
            },
          }),
        };
      }

      throw new Error(`Unexpected collection: ${name}`);
    },
  };

  const recordSessionCreated = createSessionCreatedHandler({
    getDb: () => db,
    getOccurredAt: () => new Timestamp(300, 0),
  });

  await recordSessionCreated({
    params: {
      userId: "user-1",
      sessionId: "session-1",
    },
  });

  assert.equal(writtenEvent.userName, null);
  assert.equal(writtenEvent.userId, "user-1");
});
