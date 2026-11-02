// Run only against local Auth + Firestore emulators, never production.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { createRequireAdmin } = require("../adminAuthorization");
const { createGetUsers } = require("../adminUsers");
const { createAdminStatsProvider, createCallableGetAdminStats } = require("../admin");

assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");

test("dashboard statistics against local Firebase data", async (t) => {
  const app = initializeApp({ projectId: "demo-speaksharp-admin-stats" }, "admin-stats-test");
  const db = getFirestore(app);
  const auth = getAuth(app);
  t.after(async () => {
    await db.terminate();
    await deleteApp(app);
  });
  const end = new Date("2026-11-01T12:00:00Z");
  const start = new Date("2026-10-25T12:00:00Z");
  const before = new Date(start.getTime() - 1);
  const after = new Date(end.getTime() + 1);
  const dependencies = { getDb: () => db, getAuth: () => auth, now: () => end.getTime() };
  const provider = createAdminStatsProvider(dependencies);
  const requireAdmin = createRequireAdmin(dependencies);
  const handler = createCallableGetAdminStats({ requireAdmin, getStats: provider });
  const request = { auth: { uid: "admin", token: { admin: true } } };

  await t.test("empty database yields four numeric zeros", async () => {
    assert.deepEqual(await provider(), {
      totalUsers: 0, totalSessions: 0, totalRecordings: 0, recentlyActiveUsers: 0,
    });
  });

  await t.test("profile count matches the directory, including suspended and unverified users", async () => {
    await Promise.all([
      auth.createUser({ uid: "admin", emailVerified: true }),
      auth.createUser({ uid: "alice", emailVerified: true }),
      auth.createUser({ uid: "bob", disabled: true }),
      auth.createUser({ uid: "carol" }),
      auth.createUser({ uid: "auth-only" }),
    ]);
    await auth.setCustomUserClaims("admin", { admin: true });
    const batch = db.batch();
    for (const uid of ["admin", "alice", "bob", "carol", "orphan-profile"]) {
      batch.set(db.doc(`users/${uid}`), { fullName: uid, createdAt: before });
    }
    await batch.commit();
    const directory = await createGetUsers({ ...dependencies, requireAdmin })(request);
    const stats = await handler(request);
    assert.equal(directory.total, 3);
    assert.deepEqual(stats, {
      totalUsers: directory.total, totalSessions: 0, totalRecordings: 0,
      recentlyActiveUsers: 0, activityWindowDays: 7, recentActivity: null,
    });
  });

  await t.test("older, missing and future timestamps count in totals but not recent activity", async () => {
    const batch = db.batch();
    batch.set(db.doc("users/alice/sessions/old"), { createdAt: before, updatedAt: end });
    batch.set(db.doc("users/bob/sessions/old"), { createdAt: before });
    batch.set(db.doc("users/carol/sessions/missing"), { updatedAt: end });
    batch.set(db.doc("users/carol/sessions/future"), { createdAt: after });
    batch.set(db.doc("users/alice/sessions/old/recordings/old"), { createdAt: before, updatedAt: end });
    batch.set(db.doc("users/carol/sessions/missing/recordings/missing"), { updatedAt: end });
    batch.set(db.doc("users/carol/sessions/future/recordings/future"), { createdAt: after });
    await batch.commit();
    assert.deepEqual(await provider(), {
      totalUsers: 3, totalSessions: 4, totalRecordings: 3, recentlyActiveUsers: 0,
    });
  });

  await t.test("a session exactly seven days ago activates its owner", async () => {
    await db.doc("users/alice/sessions/boundary").set({ createdAt: start });
    assert.equal((await provider()).recentlyActiveUsers, 1);
  });

  await t.test("a recent recording in an older session activates a second owner", async () => {
    await db.doc("users/bob/sessions/old/recordings/current").set({
      createdAt: end, processingStatus: "failed", transcript: "PRIVATE TRANSCRIPT",
      // Ownership must come from the path, even if legacy metadata is absent or wrong.
      userId: "wrong-owner",
    });
    assert.equal((await provider()).recentlyActiveUsers, 2);
  });

  await t.test("multiple sessions and recordings deduplicate owners and preserve the response contract", async () => {
    const batch = db.batch();
    batch.set(db.doc("users/alice/sessions/another"), { createdAt: end, title: "PRIVATE TITLE" });
    batch.set(db.doc("users/alice/sessions/boundary/recordings/one"), { createdAt: start, processingStatus: "completed" });
    batch.set(db.doc("users/alice/sessions/another/recordings/two"), { createdAt: end, processingStatus: "pending_upload" });
    batch.set(db.doc("users/bob/sessions/old/recordings/another"), { createdAt: end });
    await batch.commit();
    assert.deepEqual(await handler(request), {
      totalUsers: 3, totalSessions: 6, totalRecordings: 7,
      recentlyActiveUsers: 2, activityWindowDays: 7, recentActivity: null,
    });
  });

  await t.test("rolling the clock forward expires activity without changing totals", async () => {
    const later = createAdminStatsProvider({
      ...dependencies, now: () => after.getTime() + 7 * 86400000 + 1,
    });
    assert.deepEqual(await later(), {
      totalUsers: 3, totalSessions: 6, totalRecordings: 7, recentlyActiveUsers: 0,
    });
  });

  await t.test("unauthenticated, ordinary, disabled and revoked admins cannot read stats", async () => {
    await assert.rejects(handler({}), { code: "unauthenticated" });
    await assert.rejects(handler({ auth: { uid: "alice", token: {} } }), { code: "permission-denied" });
    await auth.updateUser("admin", { disabled: true });
    await assert.rejects(handler(request), { code: "permission-denied" });
    await auth.updateUser("admin", { disabled: false });
    await auth.setCustomUserClaims("admin", {});
    await assert.rejects(handler(request), { code: "permission-denied" });
  });
});
