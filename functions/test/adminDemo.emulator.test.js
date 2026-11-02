// Local Auth + Firestore integration. Never use production accounts or endpoints.
const assert = require("node:assert/strict");
const { test } = require("node:test");
const { randomUUID } = require("node:crypto");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp: clientApp, deleteApp: deleteClient } = require("firebase/app");
const { getAuth: clientAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } = require("firebase/auth");
const { createRequireAdmin } = require("../adminAuthorization");
const { createSetUserDisabled } = require("../adminSuspension");
const { createGetUsers } = require("../adminUsers");
const { createGetUserDetails } = require("../adminReadOnly");
const { createGetAdminStats, createSessionCountProvider } = require("../admin");
const { createGetActivityLogs, createFirestoreActivityPageProvider } = require("../adminActivity");

assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
const projectId = "demo-speaksharp";

test("academic demo against local Auth and Firestore", async (t) => {
  const server = initializeApp({ projectId }, "admin-demo-server");
  const auth = getAuth(server);
  const db = getFirestore(server);
  const apps = ["admin", "normal"].map((name) => clientApp({ projectId, apiKey: "emulator-only" }, `demo-${name}`));
  const [adminAuth, normalAuth] = apps.map((app) => {
    const instance = clientAuth(app);
    connectAuthEmulator(instance, "http://127.0.0.1:9099", { disableWarnings: true });
    return instance;
  });
  t.after(async () => {
    await Promise.all(apps.map(deleteClient));
    await db.terminate();
    await deleteApp(server);
  });

  // Disposable fixtures in the demo project emulator only. Hlax's account is untouched.
  const suffix = randomUUID();
  const password = "Local-demo-password-123!";
  const admin = await auth.createUser({ email: `admin-${suffix}@example.test`, password, emailVerified: true });
  const normal = await auth.createUser({ email: `normal-${suffix}@example.test`, password, emailVerified: true });
  await auth.setCustomUserClaims(admin.uid, { admin: true });
  await db.doc(`users/${normal.uid}`).set({ fullName: `Demo ${suffix}`, email: normal.email, disabled: false, createdAt: new Date() });
  await db.doc(`users/${normal.uid}/sessions/demo-session`).set({ title: "Demo practice", createdAt: new Date() });

  const requireAdmin = createRequireAdmin({ getAuth: () => auth });
  const dependencies = { requireAdmin, getAuth: () => auth, getDb: () => db };
  const setDisabled = createSetUserDisabled(dependencies);
  const getUsers = createGetUsers(dependencies);
  const getDetails = createGetUserDetails(dependencies);
  // Tokens come from actual emulator sign-in and are verified by the Admin SDK.
  async function request(instance, data = {}) {
    const token = await auth.verifyIdToken(await instance.currentUser.getIdToken());
    return { auth: { uid: token.uid, token }, data };
  }

  await t.test("verified admin and normal user sign in; normal user cannot read admin directory", async () => {
    await signInWithEmailAndPassword(adminAuth, admin.email, password);
    await signInWithEmailAndPassword(normalAuth, normal.email, password);
    assert.equal((await adminAuth.currentUser.getIdTokenResult()).claims.admin, true);
    assert.equal(adminAuth.currentUser.emailVerified, true);
    assert.deepEqual(await requireAdmin(await request(adminAuth)), { uid: admin.uid });
    await assert.rejects(getUsers(await request(normalAuth)), { code: "permission-denied" });
  });

  await t.test("dashboard session count, directory, search and details use persisted data", async () => {
    const count = createSessionCountProvider({ getDb: () => db });
    const getStats = createGetAdminStats({ requireAdmin, getStats: async () => ({ totalSessions: await count() }) });
    const stats = await getStats(await request(adminAuth));
    assert.ok(stats.totalSessions >= 1);
    assert.equal(stats.totalRecordings, null); // Existing unavailable metric, not fabricated data.
    const directory = await getUsers(await request(adminAuth));
    assert.ok(directory.items.some((item) => item.userId === normal.uid));
    assert.ok(!directory.items.some((item) => item.userId === admin.uid));
    const search = await getUsers(await request(adminAuth, { search: normal.email }));
    assert.equal(search.total, 1);
    assert.equal(search.items[0].userId, normal.uid);
    const details = await getDetails(await request(adminAuth, { userId: normal.uid }));
    assert.equal(details.totalSessions, 1);
    assert.equal(details.accountStatus, "active");
  });

  await t.test("admin cannot suspend itself", async () => {
    await assert.rejects(setDisabled(await request(adminAuth, { userId: admin.uid, disabled: true, operationId: `op_${randomUUID()}` })), { code: "permission-denied" });
    assert.equal((await auth.getUser(admin.uid)).disabled, false);
  });

  await t.test("suspension updates Auth and profile; fresh password login is denied", async () => {
    const data = { userId: normal.uid, disabled: true, operationId: `op_${randomUUID()}` };
    const result = await setDisabled(await request(adminAuth, data));
    assert.equal(result.accountStatus, "suspended");
    assert.deepEqual(await setDisabled(await request(adminAuth, data)), result);
    assert.equal((await auth.getUser(normal.uid)).disabled, true);
    assert.equal((await db.doc(`users/${normal.uid}`).get()).data().disabled, true);
    await signOut(normalAuth);
    await assert.rejects(signInWithEmailAndPassword(normalAuth, normal.email, password), { code: "auth/user-disabled" });
    assert.equal(normalAuth.currentUser, null);
  });

  await t.test("reactivation restores fresh password login and active user details", async () => {
    const result = await setDisabled(await request(adminAuth, { userId: normal.uid, disabled: false, operationId: `op_${randomUUID()}` }));
    assert.equal(result.accountStatus, "active");
    assert.equal((await db.doc(`users/${normal.uid}`).get()).data().disabled, false);
    await signInWithEmailAndPassword(normalAuth, normal.email, password);
    assert.equal(normalAuth.currentUser.uid, normal.uid);
    assert.equal((await getDetails(await request(adminAuth, { userId: normal.uid }))).accountStatus, "active");
  });

  await t.test("both account actions have trusted activity events", async () => {
    const activity = createGetActivityLogs({ requireAdmin, readActivityPage: createFirestoreActivityPageProvider({ getDb: () => db }) });
    const result = await activity(await request(adminAuth, { userId: normal.uid }));
    assert.equal(result.events.length, 2);
    assert.deepEqual(result.events.map((event) => event.action).sort(), ["reactivate", "suspend"]);
  });

  await t.test("admin logout clears the client session and anonymous requests are denied", async () => {
    await signOut(adminAuth);
    assert.equal(adminAuth.currentUser, null);
    await assert.rejects(getUsers({ data: {} }), { code: "unauthenticated" });
    await signOut(normalAuth);
  });
});
