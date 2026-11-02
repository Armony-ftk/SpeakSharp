
const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createRequireAdmin } = require("./adminAuthorization");

function request({ uid = "admin-uid", token = { admin: true } } = {}) {
  return { auth: { uid, token } };
}

function fakeAuth(record, error) {
  return {
    getUser: async () => {
      if (error) throw error;
      return record;
    },
  };
}

async function rejectedCode(promise, expectedCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, expectedCode);
    return true;
  });
}

test("rejects unauthenticated requests", async () => {
  let getUserCalled = false;

  const requireAdmin = createRequireAdmin({
    getAuth: () => ({
      getUser: async () => {
        getUserCalled = true;
      },
    }),
  });

  await rejectedCode(requireAdmin({}), "unauthenticated");
  assert.equal(getUserCalled, false);
});

test("rejects requests without the admin claim", async () => {
  let getUserCalled = false;

  const requireAdmin = createRequireAdmin({
    getAuth: () => ({
      getUser: async () => {
        getUserCalled = true;
      },
    }),
  });

  await rejectedCode(
    requireAdmin(request({ token: {} })),
    "permission-denied",
  );

  assert.equal(getUserCalled, false);
});

test("rejects a disabled Auth user", async () => {
  const requireAdmin = createRequireAdmin({
    getAuth: () =>
      fakeAuth({
        uid: "admin-uid",
        emailVerified: true,
        disabled: true,
        customClaims: { admin: true },
      }),
  });

  await rejectedCode(requireAdmin(request()), "permission-denied");
});

test("rejects a user whose admin claim was revoked", async () => {
  const requireAdmin = createRequireAdmin({
    getAuth: () =>
      fakeAuth({
        uid: "admin-uid",
        emailVerified: true,
        disabled: false,
        customClaims: {},
      }),
  });

  await rejectedCode(requireAdmin(request()), "permission-denied");
});

test("returns only the administrator UID when authorization succeeds", async () => {
  const requireAdmin = createRequireAdmin({
    getAuth: () =>
      fakeAuth({
        uid: "admin-uid",
        email: "admin@example.com",
        emailVerified: true,
        disabled: false,
        customClaims: { admin: true },
      }),
  });

  const result = await requireAdmin(request());

  assert.deepEqual(result, { uid: "admin-uid" });
});

test("rejects an unverified administrator", async () => {
  const requireAdmin = createRequireAdmin({
    getAuth: () =>
      fakeAuth({
        uid: "admin-uid",
        emailVerified: false,
        disabled: false,
        customClaims: { admin: true },
      }),
  });

  await rejectedCode(requireAdmin(request()), "permission-denied");
});

test("rejects a user who no longer exists", async () => {
  const requireAdmin = createRequireAdmin({
    getAuth: () =>
      fakeAuth(undefined, { code: "auth/user-not-found" }),
  });

  await rejectedCode(requireAdmin(request()), "permission-denied");
});

test("hides unexpected Auth lookup errors", async () => {
  const requireAdmin = createRequireAdmin({
    getAuth: () =>
      fakeAuth(undefined, { code: "auth/internal-error" }),
  });

  await rejectedCode(requireAdmin(request()), "internal");
});
