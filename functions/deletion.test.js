const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createDeleteSessionHandler } = require("./deletion");

function createDependencies({
  authUser = { uid: "user-1", disabled: false },
  profile = { disabled: false },
  sessionExists = true,
  authError,
  profileError,
} = {}) {
  const calls = [];
  const sessionReference = {
    async get() {
      calls.push("session.get");
      if (!sessionExists) return { exists: false };
      return { exists: true };
    },
  };
  const profileReference = {
    async get() {
      calls.push("profile.get");
      if (profileError) throw profileError;
      return {
        exists: profile != null,
        data: () => profile,
      };
    },
  };
  const firestore = {
    doc(path) {
      calls.push(`doc:${path}`);
      if (path.startsWith("users/") && !path.includes("/sessions/")) {
        return profileReference;
      }
      return sessionReference;
    },
    async recursiveDelete() {
      calls.push("recursiveDelete");
    },
  };
  const storage = {
    bucket() {
      return {
        async deleteFiles(options) {
          calls.push(["deleteFiles", options]);
        },
      };
    },
  };
  const loggerDependency = {
    info() {
      calls.push("logger.info");
    },
    error() {
      calls.push("logger.error");
    },
  };

  return {
    calls,
    dependencies: {
      getAuth: () => ({
        async getUser() {
          calls.push("auth.getUser");
          if (authError) throw authError;
          return authUser;
        },
      }),
      getDb: () => firestore,
      getStorage: () => storage,
      loggerDependency,
    },
  };
}

async function expectHttpsError(operation, code) {
  await assert.rejects(operation, (error) => error.code === code);
}

test("active users can delete only their own session", async () => {
  const { calls, dependencies } = createDependencies();
  const deleteSession = createDeleteSessionHandler(dependencies);

  const result = await deleteSession({
    auth: { uid: "user-1" },
    data: { sessionId: "session-1" },
  });

  assert.deepEqual(result, { success: true, sessionId: "session-1" });
  assert.deepEqual(calls.slice(0, 5), [
    "auth.getUser",
    "doc:users/user-1",
    "profile.get",
    "doc:users/user-1/sessions/session-1",
    "session.get",
  ]);
  assert.equal(calls[5][0], "deleteFiles");
  assert.equal(calls[6], "recursiveDelete");
  assert.match(calls[5][1].prefix, /^users\/user-1\/sessions\/session-1\//);
});

test("suspended users are denied before deleting session or recording files", async () => {
  const { calls, dependencies } = createDependencies({
    profile: { disabled: true },
  });
  const deleteSession = createDeleteSessionHandler(dependencies);

  await expectHttpsError(
    deleteSession({
      auth: { uid: "user-1" },
      data: { sessionId: "session-1" },
    }),
    "permission-denied",
  );

  assert.deepEqual(calls, [
    "auth.getUser",
    "doc:users/user-1",
    "profile.get",
  ]);
});

test("Auth-disabled users are denied before reading the profile or session", async () => {
  const { calls, dependencies } = createDependencies({
    authUser: { uid: "user-1", disabled: true },
  });
  const deleteSession = createDeleteSessionHandler(dependencies);

  await expectHttpsError(
    deleteSession({
      auth: { uid: "user-1" },
      data: { sessionId: "session-1" },
    }),
    "permission-denied",
  );

  assert.deepEqual(calls, ["auth.getUser"]);
});

test("unauthenticated callers are denied before any access", async () => {
  const { calls, dependencies } = createDependencies();
  const deleteSession = createDeleteSessionHandler(dependencies);

  await expectHttpsError(
    deleteSession({ data: { sessionId: "session-1" } }),
    "unauthenticated",
  );

  assert.deepEqual(calls, []);
});

test("a caller cannot delete another user's session", async () => {
  const { calls, dependencies } = createDependencies({
    sessionExists: false,
  });
  const deleteSession = createDeleteSessionHandler(dependencies);

  await expectHttpsError(
    deleteSession({
      auth: { uid: "user-1" },
      data: { sessionId: "user-2-session" },
    }),
    "not-found",
  );

  assert.ok(calls.includes("doc:users/user-1/sessions/user-2-session"));
  assert.ok(!calls.includes("recursiveDelete"));
  assert.ok(!calls.some((call) => Array.isArray(call) && call[0] === "deleteFiles"));
});

test("a missing profile is handled before the session is read", async () => {
  const { calls, dependencies } = createDependencies({ profile: null });
  const deleteSession = createDeleteSessionHandler(dependencies);

  await expectHttpsError(
    deleteSession({
      auth: { uid: "user-1" },
      data: { sessionId: "session-1" },
    }),
    "not-found",
  );

  assert.deepEqual(calls, [
    "auth.getUser",
    "doc:users/user-1",
    "profile.get",
  ]);
});

test("a missing session is handled before touching Storage", async () => {
  const { calls, dependencies } = createDependencies({ sessionExists: false });
  const deleteSession = createDeleteSessionHandler(dependencies);

  await expectHttpsError(
    deleteSession({
      auth: { uid: "user-1" },
      data: { sessionId: "missing-session" },
    }),
    "not-found",
  );

  assert.ok(!calls.some((call) => Array.isArray(call) && call[0] === "deleteFiles"));
  assert.ok(!calls.includes("recursiveDelete"));
});

test("unexpected Auth lookup failures return a safe internal error", async () => {
  const { dependencies } = createDependencies({
    authError: new Error("sensitive Auth service details"),
  });
  const deleteSession = createDeleteSessionHandler(dependencies);

  await assert.rejects(
    deleteSession({
      auth: { uid: "user-1" },
      data: { sessionId: "session-1" },
    }),
    (error) =>
      error.code === "internal" &&
      !error.message.includes("sensitive Auth service details"),
  );
});
