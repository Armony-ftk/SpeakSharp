const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");

const {
  createCallableSetUserDisabled,
  createSetUserDisabled,
} = require("./adminSuspension");

const OPERATION_ID = "op_123e4567-e89b-42d3-a456-426614174000";

function createDependencies({
  operator = { uid: "admin-1" },
  targetUser = {
    uid: "user-1",
    disabled: false,
    customClaims: {},
  },
  profileExists = true,
  requireAdmin = async () => operator,
  authError = null,
  updateError = null,
  revokeError = null,
  profileUpdateError = null,
  operationClaimError = null,
  operationClaimResult = { status: "pending", result: null, claimed: true },
  operationCompletionError = null,
  finalAuthDisabled,
  finalProfileDisabled,
  operationManagerDependency = null,
} = {}) {
  const calls = [];
  const authState = { ...targetUser };
  const profileState = { disabled: Boolean(targetUser.disabled) };
  let authReadCount = 0;
  let profileReadCount = 0;

  return {
    calls,
    requireAdmin,
    getAuth: () => ({
      getUser: async (userId) => {
        calls.push(["getUser", userId]);
        if (authError) {
          throw authError;
        }
        authReadCount += 1;
        return authReadCount > 1 && finalAuthDisabled !== undefined
          ? { ...authState, disabled: finalAuthDisabled }
          : authState;
      },
      updateUser: async (userId, data) => {
        calls.push(["updateUser", userId, data]);
        if (updateError) {
          throw updateError;
        }
        authState.disabled = data.disabled;
      },
      revokeRefreshTokens: async (userId) => {
        calls.push(["revokeRefreshTokens", userId]);
        if (revokeError) {
          throw revokeError;
        }
      },
    }),
    getDb: () => ({
      collection: (name) => {
        assert.equal(name, "users");
        return {
          doc: (userId) => ({
            get: async () => {
              calls.push(["profileGet", userId]);
              profileReadCount += 1;
              return {
                exists: profileExists,
                data: () => ({
                  ...profileState,
                  ...(profileReadCount > 1 && finalProfileDisabled !== undefined
                    ? { disabled: finalProfileDisabled }
                    : {}),
                }),
              };
            },
            update: async (data) => {
              calls.push(["profileUpdate", userId, data]);
              if (profileUpdateError) {
                throw profileUpdateError;
              }
              Object.assign(profileState, data);
            },
          }),
        };
      },
    }),
    operationManager: operationManagerDependency || {
      claimOperation: async (binding) => {
        calls.push(["claimOperation", binding]);
        if (operationClaimError) {
          throw operationClaimError;
        }
        return operationClaimResult;
      },
      completeOperation: async (input) => {
        calls.push(["completeOperation", input]);
        if (operationCompletionError) {
          throw operationCompletionError;
        }
        return input.result;
      },
    },
    now: () => "2026-10-29T12:00:00.000Z",
  };
}

test("rejects unauthenticated callers before target access", async () => {
  const dependencies = createDependencies({
    requireAdmin: async () => {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    },
  });

  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      auth: null,
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "unauthenticated",
  );

  assert.deepEqual(dependencies.calls, []);
});

test("rejects non-admin callers before target access", async () => {
  const dependencies = createDependencies({
    requireAdmin: async () => {
      throw new HttpsError(
        "permission-denied",
        "Admin access is required.",
      );
    },
  });

  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      auth: { uid: "user-2" },
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "permission-denied",
  );

  assert.deepEqual(dependencies.calls, []);
});

test("authorizes before reading or modifying the target", async () => {
  const calls = [];
  const dependencies = createDependencies({
    requireAdmin: async () => {
      calls.push("authorize");
      return { uid: "admin-1" };
    },
  });
  dependencies.calls.push = (...items) => {
    Array.prototype.push.apply(calls, items);
  };

  const setUserDisabled = createSetUserDisabled(dependencies);
  await setUserDisabled({
    data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
  });

  assert.deepEqual(calls.map((entry) => entry === "authorize" ? entry : entry[0]), [
    "authorize",
    "getUser",
    "profileGet",
    "claimOperation",
    "profileUpdate",
    "updateUser",
    "revokeRefreshTokens",
    "getUser",
    "profileGet",
    "completeOperation",
  ]);
});

test("rejects invalid IDs and non-boolean disabled values before target access", async () => {
  for (const data of [
    { userId: "user-1", disabled: true },
    { userId: "", disabled: true, operationId: OPERATION_ID },
    { userId: "users/user-1", disabled: true, operationId: OPERATION_ID },
    { userId: "user-1", disabled: "true", operationId: OPERATION_ID },
  ]) {
    const dependencies = createDependencies();
    const setUserDisabled = createSetUserDisabled(dependencies);

    await assert.rejects(
      setUserDisabled({ data }),
      (error) => error.code === "invalid-argument",
    );

    assert.deepEqual(dependencies.calls, []);
  }
});

test("returns not-found when the target Auth account is missing", async () => {
  const dependencies = createDependencies({
    authError: { code: "auth/user-not-found" },
  });

  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      data: {
        userId: "missing-user",
        disabled: true,
        operationId: OPERATION_ID,
      },
    }),
    (error) => error.code === "not-found",
  );
});

test("returns not-found when the required profile is missing", async () => {
  const dependencies = createDependencies({ profileExists: false });
  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "not-found",
  );

  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    ["getUser", "profileGet"],
  );
});

test("rejects self-suspension before reading the profile", async () => {
  const dependencies = createDependencies({
    operator: { uid: "user-1" },
  });
  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "permission-denied",
  );

  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    ["getUser"],
  );
});

test("rejects a target administrator before reading the profile", async () => {
  const dependencies = createDependencies({
    targetUser: {
      uid: "other-admin",
      disabled: false,
      customClaims: { admin: true },
    },
  });
  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      data: {
        userId: "other-admin",
        disabled: true,
        operationId: OPERATION_ID,
      },
    }),
    (error) => error.code === "permission-denied",
  );

  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    ["getUser"],
  );
});

test("suspends a user in mirror, Auth, and refresh-token order", async () => {
  const dependencies = createDependencies();
  const setUserDisabled = createSetUserDisabled(dependencies);

  const result = await setUserDisabled({
    data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
  });

  assert.deepEqual(result, {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  });
  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    [
      "getUser",
      "profileGet",
      "claimOperation",
      "profileUpdate",
      "updateUser",
      "revokeRefreshTokens",
      "getUser",
      "profileGet",
      "completeOperation",
    ],
  );
  assert.deepEqual(dependencies.calls[3][2], { disabled: true });
  assert.deepEqual(dependencies.calls[4][2], { disabled: true });
  assert.deepEqual(dependencies.calls[2][1], {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  });
});

function createConcurrentClaimManager() {
  let claimCount = 0;
  let completeCount = 0;
  let releaseFirstClaim;
  let firstClaimEntered;
  const firstEntered = new Promise((resolve) => {
    firstClaimEntered = resolve;
  });
  const secondEntered = new Promise((resolve) => {
    releaseFirstClaim = resolve;
  });

  return {
    claimOperation: async (binding) => {
      claimCount += 1;
      if (claimCount === 1) {
        firstClaimEntered();
        await secondEntered;
        return { status: "pending", result: null, claimed: true };
      }

      await firstEntered;
      releaseFirstClaim();
      return { status: "pending", result: null, claimed: false };
    },
    completeOperation: async ({ result }) => {
      completeCount += 1;
      return result;
    },
    get completeCount() {
      return completeCount;
    },
  };
}

async function runConcurrentCallableClaims(operationIds, secondDisabled) {
  const operationManager = createConcurrentClaimManager();
  const first = createDependencies({ operationManagerDependency: operationManager });
  const second = createDependencies({ operationManagerDependency: operationManager });

  const results = await Promise.allSettled([
    createSetUserDisabled(first)({
      data: {
        userId: "user-1",
        disabled: true,
        operationId: operationIds[0],
      },
    }),
    createSetUserDisabled(second)({
      data: {
        userId: "user-1",
        disabled: secondDisabled,
        operationId: operationIds[1],
      },
    }),
  ]);

  return { first, second, results, operationManager };
}

test("same-ID concurrent retries fail closed without repeating external mutations", async () => {
  const { first, second, results, operationManager } = await runConcurrentCallableClaims([
    OPERATION_ID,
    OPERATION_ID,
  ], true);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "failed-precondition");

  const allCalls = [...first.calls, ...second.calls];
  assert.equal(
    allCalls.filter((entry) => entry[0] === "profileUpdate").length,
    1,
  );
  assert.equal(
    allCalls.filter((entry) => entry[0] === "updateUser").length,
    1,
  );
  assert.equal(operationManager.completeCount, 1);
});

test("different-ID competing requests reject before external mutations", async () => {
  const { first, second, results, operationManager } = await runConcurrentCallableClaims([
    OPERATION_ID,
    "op_123e4567-e89b-42d3-a456-426614174001",
  ], false);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(results.find((result) => result.status === "rejected").reason.code, "failed-precondition");

  const allCalls = [...first.calls, ...second.calls];
  assert.equal(
    allCalls.filter((entry) => entry[0] === "profileUpdate").length,
    1,
  );
  assert.equal(
    allCalls.filter((entry) => entry[0] === "updateUser").length,
    1,
  );
  assert.equal(operationManager.completeCount, 1);
});

test("reactivates a user in Auth before clearing the mirror", async () => {
  const dependencies = createDependencies({
    targetUser: {
      uid: "user-1",
      disabled: true,
      customClaims: {},
    },
  });
  const setUserDisabled = createSetUserDisabled(dependencies);

  const result = await setUserDisabled({
    data: { userId: "user-1", disabled: false, operationId: OPERATION_ID },
  });

  assert.deepEqual(result, {
    userId: "user-1",
    accountStatus: "active",
    updatedAt: "2026-10-29T12:00:00.000Z",
  });
  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    [
      "getUser",
      "profileGet",
      "claimOperation",
      "updateUser",
      "profileUpdate",
      "getUser",
      "profileGet",
      "completeOperation",
    ],
  );
  assert.deepEqual(dependencies.calls[3][2], { disabled: false });
  assert.deepEqual(dependencies.calls[4][2], { disabled: false });
});

test("maps Auth failure after the suspension mirror to a safe error", async () => {
  const originalError = new Error("private Auth failure");
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logged.push(args);

  try {
    const dependencies = createDependencies({ updateError: originalError });
    const callable = createCallableSetUserDisabled(dependencies);

    await assert.rejects(
      callable({
        data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
      }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes("private Auth failure"),
    );

    assert.equal(dependencies.calls[3][0], "profileUpdate");
    assert.ok(
      logged.some((args) =>
        args.some((value) => value?.error === originalError),
      ),
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test("maps reactivation profile failure to a safe error after Auth enable", async () => {
  const originalError = new Error("private Firestore failure");
  const dependencies = createDependencies({
    profileUpdateError: originalError,
  });
  const callable = createCallableSetUserDisabled(dependencies);

  await assert.rejects(
    callable({
      data: { userId: "user-1", disabled: false, operationId: OPERATION_ID },
    }),
    (error) =>
      error.code === "internal" &&
      !String(error.message).includes("private Firestore failure"),
  );

  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    ["getUser", "profileGet", "claimOperation", "updateUser", "profileUpdate"],
  );
});

test("maps unexpected Auth lookup failures to a generic internal error", async () => {
  const originalError = new Error("private Auth lookup detail");
  const logged = [];
  const originalConsoleError = console.error;
  console.error = (...args) => logged.push(args);

  try {
    const callable = createCallableSetUserDisabled(
      createDependencies({ authError: originalError }),
    );

    await assert.rejects(
      callable({
        data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
      }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes("private Auth lookup detail"),
    );

    assert.ok(logged.length > 0);
  } finally {
    console.error = originalConsoleError;
  }
});

test("does not complete when final Auth state verification fails", async () => {
  const dependencies = createDependencies({ finalAuthDisabled: false });
  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "internal",
  );

  assert.equal(
    dependencies.calls.some((entry) => entry[0] === "completeOperation"),
    false,
  );
});

test("does not complete when final Firestore mirror verification fails", async () => {
  const dependencies = createDependencies({ finalProfileDisabled: false });
  const setUserDisabled = createSetUserDisabled(dependencies);

  await assert.rejects(
    setUserDisabled({
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "internal",
  );

  assert.equal(
    dependencies.calls.some((entry) => entry[0] === "completeOperation"),
    false,
  );
});

test("preserves an unresolved operation when completion fails", async () => {
  const dependencies = createDependencies({
    operationCompletionError: new HttpsError(
      "failed-precondition",
      "Completion conflict.",
    ),
  });
  const callable = createCallableSetUserDisabled(dependencies);

  await assert.rejects(
    callable({
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    (error) => error.code === "failed-precondition",
  );

  assert.equal(
    dependencies.calls.filter((entry) => entry[0] === "completeOperation")
      .length,
    1,
  );
});

test("same completed operation returns its stored result without repeating mutations", async () => {
  const completedResult = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const dependencies = createDependencies({
    targetUser: {
      uid: "user-1",
      disabled: true,
      customClaims: {},
    },
    operationClaimResult: { status: "completed", result: completedResult },
  });
  const setUserDisabled = createSetUserDisabled(dependencies);

  assert.deepEqual(
    await setUserDisabled({
      data: { userId: "user-1", disabled: true, operationId: OPERATION_ID },
    }),
    completedResult,
  );
  assert.deepEqual(
    dependencies.calls.map((entry) => entry[0]),
    ["getUser", "profileGet", "claimOperation", "getUser", "profileGet"],
  );
});
