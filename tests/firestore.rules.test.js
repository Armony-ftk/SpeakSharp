const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { after, before, test } = require("node:test");
const {
  initializeTestEnvironment,
} = require("@firebase/rules-unit-testing");
const { deleteField, serverTimestamp } = require("firebase/firestore");

const PROJECT_ID = "speaksharp-firestore-rules-test";
const FIRESTORE_HOST = "127.0.0.1";
const FIRESTORE_PORT = 8080;
const RULES_PATH = path.resolve(__dirname, "..", "firestore.rules");

let testEnvironment;

function authenticatedDb(userId) {
  return testEnvironment.authenticatedContext(userId).firestore();
}

async function seedDocument(path, data) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await context.firestore().doc(path).set(data);
  });
}

function profileData(overrides = {}) {
  return {
    fullName: "Rules Test User",
    email: "rules-test@example.com",
    createdAt: new Date(),
    ...overrides,
  };
}

function sessionData(overrides = {}) {
  return {
    title: "Rules Test Session",
    context: "Rules test",
    targetDurationSeconds: 300,
    presentationDate: null,
    status: "active",
    attemptCount: 0,
    latestRating: null,
    bestRating: null,
    ratingSum: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function expectDenied(operation) {
  await assert.rejects(operation, (error) => error.code === "permission-denied");
}

before(async () => {
  const rules = fs.readFileSync(RULES_PATH, "utf8");

  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: FIRESTORE_HOST,
      port: FIRESTORE_PORT,
      rules,
    },
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test("Firestore Emulator loads the configured rules file", async () => {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    const profileReference = adminDb.doc("users/rules-smoke-user");

    await profileReference.set({
      fullName: "Rules Smoke User",
      email: "rules-smoke@example.com",
      createdAt: new Date(),
    });
  });

  const unauthenticatedDb = testEnvironment
    .unauthenticatedContext()
    .firestore();

  await assert.rejects(
    unauthenticatedDb.doc("users/rules-smoke-user").get(),
    (error) => error.code === "permission-denied",
  );
});

test("active users can read their own profile and sessions", async () => {
  const userId = "active-owner";
  await seedDocument(`users/${userId}`, profileData());
  await seedDocument(`users/${userId}/sessions/session-1`, sessionData());

  const db = authenticatedDb(userId);
  assert.equal((await db.doc(`users/${userId}`).get()).exists, true);
  assert.equal(
    (await db.doc(`users/${userId}/sessions/session-1`).get()).exists,
    true,
  );
});

test("profiles without disabled remain usable during the transition", async () => {
  const userId = "legacy-active";
  await seedDocument(`users/${userId}`, profileData());
  await seedDocument(`users/${userId}/sessions/session-1`, sessionData());

  const db = authenticatedDb(userId);
  assert.equal((await db.doc(`users/${userId}`).get()).exists, true);
  assert.equal(
    (await db.doc(`users/${userId}/sessions/session-1`).get()).exists,
    true,
  );
});

test("suspended users cannot read or write their profile or sessions", async () => {
  const userId = "suspended-owner";
  await seedDocument(`users/${userId}`, profileData({ disabled: true }));
  await seedDocument(`users/${userId}/sessions/session-1`, sessionData());

  const db = authenticatedDb(userId);
  await expectDenied(db.doc(`users/${userId}`).get());
  await expectDenied(
    db.doc(`users/${userId}`).update({ fullName: "Blocked" }),
  );
  await expectDenied(db.doc(`users/${userId}/sessions/session-1`).get());
  await expectDenied(
    db.doc(`users/${userId}/sessions/session-1`).update({
      title: "Blocked",
    }),
  );
});

test("cross-user and unauthenticated profile and session access is denied", async () => {
  await seedDocument("users/owner-a", profileData());
  await seedDocument("users/owner-a/sessions/session-1", sessionData());

  await expectDenied(authenticatedDb("owner-b").doc("users/owner-a").get());
  await expectDenied(
    authenticatedDb("owner-b").doc("users/owner-a").update({
      fullName: "Cross-user write",
    }),
  );
  await expectDenied(
    authenticatedDb("owner-b")
      .doc("users/owner-a/sessions/session-1")
      .get(),
  );
  await expectDenied(
    authenticatedDb("owner-b")
      .doc("users/owner-a/sessions/session-1")
      .update({ title: "Cross-user write" }),
  );
  await expectDenied(
    testEnvironment.unauthenticatedContext().firestore().doc("users/owner-a").get(),
  );
  await expectDenied(
    testEnvironment
      .unauthenticatedContext()
      .firestore()
      .doc("users/owner-a")
      .update({ fullName: "Unauthenticated write" }),
  );
  await expectDenied(
    testEnvironment
      .unauthenticatedContext()
      .firestore()
      .doc("users/owner-a/sessions/session-1")
      .get(),
  );
  await expectDenied(
    testEnvironment
      .unauthenticatedContext()
      .firestore()
      .doc("users/owner-a/sessions/session-1")
      .update({ title: "Unauthenticated write" }),
  );
});

test("clients cannot supply, add, remove, or change disabled", async () => {
  const missingFieldUser = "disabled-missing";
  const disabledFieldUser = "disabled-present";
  await seedDocument(`users/${missingFieldUser}`, profileData());
  await seedDocument(`users/${disabledFieldUser}`, profileData({ disabled: false }));

  await expectDenied(
    authenticatedDb(missingFieldUser)
      .doc(`users/${missingFieldUser}`)
      .update({ disabled: false }),
  );

  const disabledFieldDb = authenticatedDb(disabledFieldUser);
  const existing = await disabledFieldDb
    .doc(`users/${disabledFieldUser}`)
    .get();
  await expectDenied(
    disabledFieldDb.doc(`users/${disabledFieldUser}`).update({
      ...existing.data(),
      disabled: true,
    }),
  );
  await expectDenied(
    disabledFieldDb.doc(`users/${disabledFieldUser}`).update({
      disabled: deleteField(),
    }),
  );
});

test("profile creation preserves validation and rejects client disabled fields", async () => {
  const db = authenticatedDb("new-profile-user");
  await expectDenied(
    db.doc("users/new-profile-user").set({
      ...profileData({ createdAt: serverTimestamp(), disabled: false }),
    }),
  );
  await expectDenied(
    db.doc("users/new-profile-user").set({
      ...profileData({ createdAt: serverTimestamp(), role: "admin" }),
    }),
  );
});

test("session validation preserves attempt and rating protections", async () => {
  const userId = "session-validation-user";
  await seedDocument(`users/${userId}`, profileData());
  const db = authenticatedDb(userId);

  await expectDenied(
    db.doc(`users/${userId}/sessions/invalid-create`).set({
      ...sessionData({
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        attemptCount: 1,
      }),
    }),
  );

  await seedDocument(`users/${userId}/sessions/valid-session`, sessionData());
  const stored = await db.doc(`users/${userId}/sessions/valid-session`).get();
  await expectDenied(
    db.doc(`users/${userId}/sessions/valid-session`).update({
      ...stored.data(),
      attemptCount: 1,
    }),
  );
  await expectDenied(
    db.doc(`users/${userId}/sessions/valid-session`).update({
      ...stored.data(),
      latestRating: 5,
    }),
  );
});

test("clients cannot read or write top-level admin activity logs", async () => {
  await seedDocument("adminActivityLogs/event-1", {
    userId: "user-1",
    type: "session_created",
    status: "success",
    occurredAt: new Date(),
  });

  for (const db of [
    testEnvironment.unauthenticatedContext().firestore(),
    authenticatedDb("ordinary-user"),
    authenticatedDb("admin-user"),
  ]) {
    await expectDenied(db.doc("adminActivityLogs/event-1").get());
    await expectDenied(
      db.doc("adminActivityLogs/event-2").set({ type: "forged" }),
    );
  }
});

test("clients cannot read or write account-status operation records", async () => {
  await seedDocument("adminAccountStatusOperations/operation-1", {
    operationId: "operation-1",
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
    status: "pending",
  });
  await seedDocument("adminAccountStatusLocks/user-1", {
    operationId: "operation-1",
    targetUserId: "user-1",
    status: "pending",
  });

  for (const db of [
    testEnvironment.unauthenticatedContext().firestore(),
    authenticatedDb("ordinary-user"),
    authenticatedDb("admin-user"),
  ]) {
    await expectDenied(
      db.doc("adminAccountStatusOperations/operation-1").get(),
    );
    await expectDenied(
      db.doc("adminAccountStatusOperations/operation-2").set({
        status: "forged",
      }),
    );
    await expectDenied(
      db.doc("adminAccountStatusOperations/operation-1").update({
        status: "completed",
      }),
    );
    await expectDenied(
      db.doc("adminAccountStatusOperations/operation-1").delete(),
    );
    await expectDenied(db.doc("adminAccountStatusLocks/user-1").get());
    await expectDenied(
      db.doc("adminAccountStatusLocks/user-2").set({
        operationId: "forged",
      }),
    );
    await expectDenied(
      db.doc("adminAccountStatusLocks/user-1").update({
        status: "completed",
      }),
    );
    await expectDenied(db.doc("adminAccountStatusLocks/user-1").delete());
  }
});
