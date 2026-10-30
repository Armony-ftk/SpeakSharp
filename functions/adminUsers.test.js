const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");

const {
  createCallableGetUsers,
  createGetUsers,
} = require("./adminUsers");

function createProfileSnapshot(profiles) {
  return {
    docs: profiles.map(({ uid, data }) => ({
      id: uid,
      data: () => data,
    })),
  };
}

function createDependencies({
  authPages = [{ users: [], pageToken: undefined }],
  profiles = [],
  requireAdmin = async () => {},
} = {}) {
  return {
    requireAdmin,

    getAuth: () => ({
      listUsers: async (_maxResults, pageToken) => {
        const pageIndex = pageToken ? Number(pageToken) : 0;
        const page = authPages[pageIndex];

        return {
          users: page?.users ?? [],
          pageToken:
            page?.pageToken == null
              ? undefined
              : String(page.pageToken),
        };
      },
    }),

    getDb: () => ({
      collection: (name) => {
        assert.equal(name, "users");

        return {
          get: async () => createProfileSnapshot(profiles),
        };
      },
    }),
  };
}

test("authorizes before reading Auth or Firestore data", async () => {
  const calls = [];

  const getUsers = createGetUsers({
    requireAdmin: async () => {
      calls.push("authorize");
    },

    getAuth: () => {
      calls.push("auth");

      return {
        listUsers: async () => ({ users: [] }),
      };
    },

    getDb: () => {
      calls.push("firestore");

      return {
        collection: () => ({
          get: async () => ({ docs: [] }),
        }),
      };
    },
  });

  await getUsers({ data: {} });

  assert.deepEqual(calls, [
    "authorize",
    "auth",
    "firestore",
  ]);
});

test("rejects unauthenticated requests before data reads", async () => {
  const getUsers = createGetUsers({
    requireAdmin: async () => {
      throw new HttpsError(
        "unauthenticated",
        "Authentication is required.",
      );
    },

    getAuth: () => {
      throw new Error("Auth should not be read.");
    },

    getDb: () => {
      throw new Error("Firestore should not be read.");
    },
  });

  await assert.rejects(
    getUsers({ auth: null, data: {} }),
    (error) => error.code === "unauthenticated",
  );
});

test("rejects non-admin requests before data reads", async () => {
  const getUsers = createGetUsers({
    requireAdmin: async () => {
      throw new HttpsError(
        "permission-denied",
        "Admin access is required.",
      );
    },

    getAuth: () => {
      throw new Error("Auth should not be read.");
    },

    getDb: () => {
      throw new Error("Firestore should not be read.");
    },
  });

  await assert.rejects(
    getUsers({
      auth: { uid: "user-1" },
      data: {},
    }),
    (error) => error.code === "permission-denied",
  );
});

test("reads multiple Firebase Auth pages", async () => {
  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: [
            {
              uid: "user-1",
              email: "one@example.com",
              disabled: false,
              customClaims: {},
            },
          ],
          pageToken: "1",
        },
        {
          users: [
            {
              uid: "user-2",
              email: "two@example.com",
              disabled: false,
              customClaims: {},
            },
          ],
        },
      ],

      profiles: [
        { uid: "user-1", data: { fullName: "One" } },
        { uid: "user-2", data: { fullName: "Two" } },
      ],
    }),
  );

  const result = await getUsers({ data: {} });

  assert.equal(result.total, 2);

  assert.deepEqual(
    result.items.map((item) => item.userId),
    ["user-1", "user-2"],
  );
});

test("excludes admins, orphan profiles, and Auth users without profiles", async () => {
  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: [
            {
              uid: "admin-1",
              email: "admin@example.com",
              disabled: false,
              customClaims: { admin: true },
            },
            {
              uid: "user-1",
              email: "user@example.com",
              disabled: false,
              customClaims: {},
            },
            {
              uid: "user-no-profile",
              email: "missing-profile@example.com",
              disabled: false,
              customClaims: {},
            },
          ],
        },
      ],

      profiles: [
        {
          uid: "admin-1",
          data: { fullName: "Admin" },
        },
        {
          uid: "user-1",
          data: { fullName: "User" },
        },
        {
          uid: "orphan-profile",
          data: { fullName: "Orphan" },
        },
      ],
    }),
  );

  const result = await getUsers({ data: {} });

  assert.deepEqual(result.items, [
    {
      userId: "user-1",
      fullName: "User",
      email: "user@example.com",
      accountStatus: "active",
      createdAt: null,
    },
  ]);
});

test("prefers Auth email over profile email", async () => {
  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: [
            {
              uid: "user-1",
              email: "auth@example.com",
              disabled: false,
              customClaims: {},
            },
          ],
        },
      ],

      profiles: [
        {
          uid: "user-1",
          data: {
            fullName: "User",
            email: "stale-profile@example.com",
          },
        },
      ],
    }),
  );

  const result = await getUsers({ data: {} });

  assert.equal(
    result.items[0].email,
    "auth@example.com",
  );
});

test("supports case-insensitive name and email searches", async () => {
  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: [
            {
              uid: "user-1",
              email: "amina@example.com",
              disabled: false,
              customClaims: {},
            },
            {
              uid: "user-2",
              email: "daniel@example.com",
              disabled: false,
              customClaims: {},
            },
          ],
        },
      ],

      profiles: [
        { uid: "user-1", data: { fullName: "Amina D." } },
        { uid: "user-2", data: { fullName: "Daniel P." } },
      ],
    }),
  );

  const byName = await getUsers({
    data: { search: "AMINA" },
  });

  const byEmail = await getUsers({
    data: { search: "DANIEL@EXAMPLE.COM" },
  });

  assert.deepEqual(
    byName.items.map((item) => item.userId),
    ["user-1"],
  );

  assert.deepEqual(
    byEmail.items.map((item) => item.userId),
    ["user-2"],
  );
});

test("supports active and suspended status filters", async () => {
  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: [
            {
              uid: "user-1",
              email: "active@example.com",
              disabled: false,
              customClaims: {},
            },
            {
              uid: "user-2",
              email: "suspended@example.com",
              disabled: true,
              customClaims: {},
            },
          ],
        },
      ],

      profiles: [
        { uid: "user-1", data: { fullName: "Active User" } },
        { uid: "user-2", data: { fullName: "Suspended User" } },
      ],
    }),
  );

  const active = await getUsers({
    data: { status: "active" },
  });

  const suspended = await getUsers({
    data: { status: "suspended" },
  });

  assert.deepEqual(
    active.items.map((item) => item.userId),
    ["user-1"],
  );

  assert.deepEqual(
    suspended.items.map((item) => item.userId),
    ["user-2"],
  );
});

test("supports multiple directory pages", async () => {
  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: [
            {
              uid: "user-1",
              email: "one@example.com",
              disabled: false,
              customClaims: {},
            },
            {
              uid: "user-2",
              email: "two@example.com",
              disabled: false,
              customClaims: {},
            },
            {
              uid: "user-3",
              email: "three@example.com",
              disabled: false,
              customClaims: {},
            },
          ],
        },
      ],

      profiles: [
        { uid: "user-1", data: { fullName: "One" } },
        { uid: "user-2", data: { fullName: "Two" } },
        { uid: "user-3", data: { fullName: "Three" } },
      ],
    }),
  );

  const firstPage = await getUsers({
    data: { pageSize: 2 },
  });

  const secondPage = await getUsers({
    data: {
      pageSize: 2,
      cursor: firstPage.nextCursor,
    },
  });

  assert.deepEqual(
    firstPage.items.map((item) => item.userId),
    ["user-1", "user-2"],
  );

  assert.deepEqual(
    secondPage.items.map((item) => item.userId),
    ["user-3"],
  );

  assert.equal(secondPage.nextCursor, null);
});

test("paginates correctly with mixed-case UIDs", async () => {
  const ids = ["b-user", "A-user", "a-user"];

  const getUsers = createGetUsers(
    createDependencies({
      authPages: [
        {
          users: ids.map((uid) => ({
            uid,
            email: `${uid}@example.com`,
            disabled: false,
            customClaims: {},
          })),
        },
      ],

      profiles: ids.map((uid) => ({
        uid,
        data: { fullName: uid },
      })),
    }),
  );

  const firstPage = await getUsers({
    data: { pageSize: 1 },
  });

  const secondPage = await getUsers({
    data: {
      pageSize: 1,
      cursor: firstPage.nextCursor,
    },
  });

  const thirdPage = await getUsers({
    data: {
      pageSize: 1,
      cursor: secondPage.nextCursor,
    },
  });

  assert.deepEqual(
    [
      firstPage.items[0].userId,
      secondPage.items[0].userId,
      thirdPage.items[0].userId,
    ],
    ["A-user", "a-user", "b-user"],
  );
});

test("continues after a cursor user disappears", async () => {
  const allProfiles = [
    { uid: "user-1", data: { fullName: "One" } },
    { uid: "user-2", data: { fullName: "Two" } },
    { uid: "user-3", data: { fullName: "Three" } },
  ];

  let currentProfiles = [...allProfiles];

  const dependencies = createDependencies({
    authPages: [
      {
        users: allProfiles.map(({ uid }) => ({
          uid,
          email: `${uid}@example.com`,
          disabled: false,
          customClaims: {},
        })),
      },
    ],
  });

  dependencies.getDb = () => ({
    collection: () => ({
      get: async () =>
        createProfileSnapshot(currentProfiles),
    }),
  });

  const getUsers = createGetUsers(dependencies);

  const firstPage = await getUsers({
    data: { pageSize: 1 },
  });

  currentProfiles = currentProfiles.filter(
    ({ uid }) => uid !== "user-1",
  );

  const secondPage = await getUsers({
    data: {
      pageSize: 1,
      cursor: firstPage.nextCursor,
    },
  });

  assert.equal(
    firstPage.items[0].userId,
    "user-1",
  );

  assert.equal(
    secondPage.items[0].userId,
    "user-2",
  );
});

test("rejects invalid query values and cursors", async () => {
  const getUsers = createGetUsers(
    createDependencies(),
  );

  await assert.rejects(
    getUsers({ data: { pageSize: 0 } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getUsers({ data: { status: "unknown" } }),
    (error) => error.code === "invalid-argument",
  );

  await assert.rejects(
    getUsers({ data: { cursor: "not-a-valid-cursor" } }),
    (error) => error.code === "invalid-argument",
  );
});

test("returns a safe internal error for unexpected callable failures", async () => {
  const originalConsoleError = console.error;
  const logged = [];

  console.error = (...args) => {
    logged.push(args);
  };

  try {
    const callable = createCallableGetUsers({
      requireAdmin: async () => {},

      getAuth: () => ({
        listUsers: async () => {
          throw new Error("private infrastructure detail");
        },
      }),

      getDb: () => ({
        collection: () => ({
          get: async () => ({ docs: [] }),
        }),
      }),
    });

    await assert.rejects(
      callable({ data: {} }),
      (error) =>
        error.code === "internal" &&
        !String(error.message).includes(
          "private infrastructure detail",
        ),
    );

    assert.equal(logged.length, 1);
  } finally {
    console.error = originalConsoleError;
  }
});
