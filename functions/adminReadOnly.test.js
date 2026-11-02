const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");

const {
  createCallableGetUserDetails,
  createGetUserDetails,
} = require("./adminReadOnly");

function createDependencies({
  authUser,
  profile,
  requireAdmin = async () => {},
  authError = null,
  profileExists = true,
  sessionCount = 0,
  sessionError = null,
} = {}) {
  let firestoreReadCount = 0;

  return {
    firestoreReads: () => firestoreReadCount,
    requireAdmin,

    getAuth: () => ({
      getUser: async () => {
        if (authError) {
          throw authError;
        }

        return authUser;
      },
    }),

    getDb: () => ({
      collection: (collectionName) => {
        assert.equal(collectionName, "users");

        return {
          doc: (userId) => ({
            get: async () => {
              firestoreReadCount += 1;

              const matchingProfile =
                userId === authUser?.uid && profileExists;

              return {
                exists: matchingProfile,
                data: () =>
                  matchingProfile ? profile : undefined,
              };
            },

            collection: (nestedCollectionName) => {
              assert.equal(nestedCollectionName, "sessions");

              return {
                count: () => ({
                  get: async () => {
                    firestoreReadCount += 1;

                    if (sessionError) {
                      throw sessionError;
                    }

                    return {
                      data: () => ({ count: sessionCount }),
                    };
                  },
                }),
              };
            },
          }),
        };
      },
    }),
  };
}

test("authorizes before reading Auth or Firestore", async () => {
  const calls = [];

  const getUserDetails = createGetUserDetails({
    requireAdmin: async () => {
      calls.push("authorize");
    },

    getAuth: () => {
      calls.push("auth");

      return {
        getUser: async () => ({
          uid: "user-1",
          email: "user@example.com",
          disabled: false,
          customClaims: {},
        }),
      };
    },

    getDb: () => {
      calls.push("firestore");

      return {
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              data: () => ({
                fullName: "User",
                email: "user@example.com",
              }),
            }),

            collection: () => ({
              count: () => ({
                get: async () => ({
                  data: () => ({ count: 0 }),
                }),
              }),
            }),
          }),
        }),
      };
    },
  });

  await getUserDetails({
    auth: { uid: "admin-1" },
    data: { userId: "user-1" },
  });

  assert.deepEqual(calls, [
    "authorize",
    "auth",
    "firestore",
  ]);
});

test("preserves unauthenticated authorization failures", async () => {
  const getUserDetails = createGetUserDetails({
    requireAdmin: async () => {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    },
  });

  await assert.rejects(
    getUserDetails({
      auth: null,
      data: { userId: "user-1" },
    }),
    (error) => error.code === "unauthenticated",
  );
});

test("preserves non-admin authorization failures before data reads", async () => {
  const getUserDetails = createGetUserDetails({
    requireAdmin: async () => {
      throw new HttpsError(
        "permission-denied",
        "Admin access is required.",
      );
    },

    getAuth: () => {
      throw new Error("Auth must not be read.");
    },

    getDb: () => {
      throw new Error("Firestore must not be read.");
    },
  });

  await assert.rejects(
    getUserDetails({
      auth: { uid: "user-1" },
      data: { userId: "user-2" },
    }),
    (error) => error.code === "permission-denied",
  );
});

test("returns confirmed profile and session metadata", async () => {
  const dependencies = createDependencies({
    authUser: {
      uid: "user-1",
      email: "current@example.com",
      disabled: false,
      customClaims: {},
    },

    profile: {
      fullName: "Amina D.",
      email: "old@example.com",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },

    sessionCount: 3,
  });

  const getUserDetails = createGetUserDetails(dependencies);

  const result = await getUserDetails({
    data: { userId: "user-1" },
  });

  assert.deepEqual(result, {
    userId: "user-1",
    fullName: "Amina D.",
    email: "current@example.com",
    accountStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    totalSessions: 3,
    totalRecordings: null,
    recentActivity: null,
  });
});

test("derives suspended status from the current Auth record", async () => {
  const getUserDetails = createGetUserDetails(
    createDependencies({
      authUser: {
        uid: "user-1",
        email: "user@example.com",
        disabled: true,
        customClaims: {},
      },

      profile: {
        fullName: "Suspended User",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },

      sessionCount: 0,
    }),
  );

  const result = await getUserDetails({
    data: { userId: "user-1" },
  });

  assert.equal(result.accountStatus, "suspended");
});

test("returns not-found for a missing Auth user", async () => {
  const getUserDetails = createGetUserDetails(
    createDependencies({
      authError: { code: "auth/user-not-found" },
    }),
  );

  await assert.rejects(
    getUserDetails({
      data: { userId: "missing-user" },
    }),
    (error) => error.code === "not-found",
  );
});

test("returns not-found for a missing profile", async () => {
  const getUserDetails = createGetUserDetails(
    createDependencies({
      authUser: {
        uid: "user-1",
        email: "user@example.com",
        disabled: false,
        customClaims: {},
      },

      profileExists: false,
    }),
  );

  await assert.rejects(
    getUserDetails({
      data: { userId: "user-1" },
    }),
    (error) => error.code === "not-found",
  );
});

test("does not expose private recording fields", async () => {
  const getUserDetails = createGetUserDetails(
    createDependencies({
      authUser: {
        uid: "user-1",
        email: "user@example.com",
        disabled: false,
        customClaims: {},
      },

      profile: {
        fullName: "User",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        transcript: "private transcript",
        audioUrl: "private audio URL",
        feedback: "private feedback",
      },

      sessionCount: 0,
    }),
  );

  const result = await getUserDetails({
    data: { userId: "user-1" },
  });

  assert.equal(Object.hasOwn(result, "transcript"), false);
  assert.equal(Object.hasOwn(result, "audioUrl"), false);
  assert.equal(Object.hasOwn(result, "feedback"), false);
});

test("maps unexpected failures to a generic internal error", async () => {
  const originalConsoleError = console.error;
  const logged = [];

  console.error = (...args) => {
    logged.push(args);
  };

  try {
    const callable = createCallableGetUserDetails({
      requireAdmin: async () => {},

      getAuth: () => ({
        getUser: async () => {
          throw new Error("private database detail");
        },
      }),
    });

    await assert.rejects(
      callable({
        data: { userId: "user-1" },
      }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes(
          "private database detail",
        ),
    );

    assert.equal(logged.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});

test("rejects an empty user ID before Auth or Firestore reads", async () => {
  let authReads = 0;
  let firestoreReads = 0;

  const getUserDetails = createGetUserDetails({
    requireAdmin: async () => {},

    getAuth: () => {
      authReads += 1;

      return {
        getUser: async () => {
          throw new Error("Auth should not be read.");
        },
      };
    },

    getDb: () => {
      firestoreReads += 1;
      throw new Error("Firestore should not be read.");
    },
  });

  await assert.rejects(
    getUserDetails({
      data: { userId: "" },
    }),
    (error) => error.code === "invalid-argument",
  );

  assert.equal(authReads, 0);
  assert.equal(firestoreReads, 0);
});

test("rejects a user ID containing a slash before Auth or Firestore reads", async () => {
  let authReads = 0;
  let firestoreReads = 0;

  const getUserDetails = createGetUserDetails({
    requireAdmin: async () => {},

    getAuth: () => {
      authReads += 1;

      return {
        getUser: async () => {
          throw new Error("Auth should not be read.");
        },
      };
    },

    getDb: () => {
      firestoreReads += 1;
      throw new Error("Firestore should not be read.");
    },
  });

  await assert.rejects(
    getUserDetails({
      data: { userId: "users/user-1" },
    }),
    (error) => error.code === "invalid-argument",
  );

  assert.equal(authReads, 0);
  assert.equal(firestoreReads, 0);
});

test("hides administrator details and does not read the profile", async () => {
  const dependencies = createDependencies({
    authUser: {
      uid: "admin-1",
      email: "admin@example.com",
      disabled: false,
      customClaims: { admin: true },
    },

    profile: {
      fullName: "Administrator",
      email: "admin@example.com",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  const getUserDetails = createGetUserDetails(dependencies);

  await assert.rejects(
    getUserDetails({
      data: { userId: "admin-1" },
    }),
    (error) => error.code === "not-found",
  );

  assert.equal(dependencies.firestoreReads(), 0);
});

test("maps session-count failures to a generic internal error and logs the original error", async () => {
  const originalError = new Error(
    "private session database detail",
  );

  const dependencies = createDependencies({
    authUser: {
      uid: "user-1",
      email: "user@example.com",
      disabled: false,
      customClaims: {},
    },

    profile: {
      fullName: "User",
      email: "user@example.com",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },

    sessionError: originalError,
  });

  const originalConsoleError = console.error;
  const logged = [];

  console.error = (...args) => {
    logged.push(args);
  };

  try {
    const callable = createCallableGetUserDetails(dependencies);

    await assert.rejects(
      callable({
        data: { userId: "user-1" },
      }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes(
          "private session database detail",
        ),
    );

    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "getUserDetails failed");
    assert.equal(logged[0][1], originalError);
  } finally {
    console.error = originalConsoleError;
  }
});

test("maps unexpected Auth lookup failures to a generic internal error", async () => {
  const originalError = new Error("private Auth lookup detail");

  const originalConsoleError = console.error;
  const logged = [];

  console.error = (...args) => {
    logged.push(args);
  };

  try {
    const callable = createCallableGetUserDetails({
      requireAdmin: async () => {},

      getAuth: () => ({
        getUser: async () => {
          throw originalError;
        },
      }),

      getDb: () => {
        throw new Error("Firestore should not be read.");
      },
    });

    await assert.rejects(
      callable({
        data: { userId: "user-1" },
      }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes(
          "private Auth lookup detail",
        ),
    );

    assert.equal(logged.length, 1);
    assert.equal(logged[0][0], "getUserDetails failed");
    assert.equal(logged[0][1], originalError);
  } finally {
    console.error = originalConsoleError;
  }
});
