// Security acceptance probes, intentionally separate from the regression suite.
// A failing denial assertion means suspension is NOT secure. Do not weaken it.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { test, after } = require("node:test");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage: getAdminStorage } = require("firebase-admin/storage");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { ref, uploadBytes, getBytes, getDownloadURL } = require("firebase/storage");
const { createRecordingDeletion } = require("../recordingDeletion");
const { createAnalysisRetry } = require("../analysisProcessor");
const { createSetUserDisabled } = require("../adminSuspension");

assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9195");
// Cross-service Storage lookups use the emulator CLI's project, not bucket ID.
const projectId = "demo-speaksharp";
const bucket = `${projectId}.appspot.com`;
const app = initializeApp({ projectId, storageBucket: bucket }, projectId);
const db = getFirestore(app);
const storageRules = fs.readFileSync(path.join(__dirname, "../../storage.rules"), "utf8");
const firestoreRules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
const environments = [];
const logger = { info() {}, warn() {}, error() {} };
let sequence = 0;

async function environment(id = projectId, rules = storageRules) {
  const env = await initializeTestEnvironment({
    projectId: id,
    firestore: { host: "127.0.0.1", port: 8085, rules: firestoreRules },
    storage: { host: "127.0.0.1", port: 9195, rules },
  });
  environments.push(env);
  return env;
}

let defaultEnvironment;
async function fixture(legacy = false) {
  defaultEnvironment ??= await environment();
  const uid = `audit-user-${++sequence}`;
  const sid = "session";
  const rid = "recording";
  const profile = db.doc(`users/${uid}`);
  const session = profile.collection("sessions").doc(sid);
  const recording = session.collection("recordings").doc(rid);
  const audioPath = legacy
    ? `users/${uid}/sessions/${sid}/recordings/${rid}.m4a`
    : `recordings/${uid}/${sid}/${rid}.m4a`;
  await profile.set({ fullName: "Audit User", email: "audit@example.test", createdAt: new Date(), disabled: false });
  await session.set({ title: "Practice", createdAt: new Date(), updatedAt: new Date() });
  await recording.set({
    userId: uid, sessionId: sid, audioPath, durationSeconds: 30,
    processingStatus: "pending_upload", createdAt: new Date(), updatedAt: new Date(),
  });
  // Reuse the same authenticated context after suspension: no token refresh.
  const storage = defaultEnvironment.authenticatedContext(uid).storage(`gs://${bucket}`);
  const object = ref(storage, audioPath);
  const upload = () => uploadBytes(object, new Uint8Array([1, 2, 3]), {
    contentType: "audio/mp4", customMetadata: { recordingId: rid },
  });
  return { uid, profile, session, recording, object, upload,
    request: { auth: { uid }, data: { sessionId: sid, recordingId: rid } } };
}

const denied = (operation) => assert.rejects(operation,
  (error) => /^(storage\/unauthorized|permission-denied)$/.test(error.code));

function suspensionHandler(f, { failAuthUpdate = false } = {}) {
  const authRecord = { uid: f.uid, disabled: false, customClaims: {} };
  const auth = {
    getUser: async () => ({ ...authRecord }),
    updateUser: async (_, updates) => {
      if (failAuthUpdate) throw new Error("mock Auth unavailable");
      Object.assign(authRecord, updates);
    },
    revokeRefreshTokens: async () => {},
  };
  return createSetUserDisabled({
    requireAdmin: async () => ({ uid: "audit-admin" }),
    getAuth: () => auth, getDb: () => db,
  });
}

test("completed suspension with real operation locks MUST block a cached-identity upload", async () => {
  const f = await fixture();
  const result = await suspensionHandler(f)({ data: {
    userId: f.uid, disabled: true, operationId: `op_${randomUUID()}`,
  } });
  assert.equal(result.accountStatus, "suspended");
  assert.equal((await f.profile.get()).data().disabled, true);
  await denied(f.upload());
});

test("interrupted suspension after the profile barrier MUST fail closed for Storage", async () => {
  const f = await fixture();
  const operationId = `op_${randomUUID()}`;
  await assert.rejects(suspensionHandler(f, { failAuthUpdate: true })({ data: {
    userId: f.uid, disabled: true, operationId,
  } }), { code: "internal" });
  assert.equal((await f.profile.get()).data().disabled, true);
  assert.equal((await db.doc(`adminAccountStatusOperations/${operationId}`).get()).data().status, "pending");
  assert.equal((await db.doc(`adminAccountStatusLocks/${f.uid}`).get()).exists, true);
  await denied(f.upload());
});

for (const legacy of [false, true]) {
  const layout = legacy ? "legacy" : "canonical";

  test(`${layout}: active and reactivated profiles retain upload and authenticated download`, async () => {
    const f = await fixture(legacy);
    await f.upload();
    assert.deepEqual(new Uint8Array(await getBytes(f.object)), new Uint8Array([1, 2, 3]));
    await f.profile.update({ disabled: true });
    await f.profile.update({ disabled: false });
    await f.upload();
    assert.equal((await getBytes(f.object)).byteLength, 3);
  });

  test(`${layout}: suspended profile MUST reject upload using the cached identity`, async () => {
    const f = await fixture(legacy);
    await f.profile.update({ disabled: true });
    await denied(f.upload());
  });

  test(`${layout}: suspended profile MUST reject authenticated download`, async () => {
    const f = await fixture(legacy);
    await f.upload();
    await f.profile.update({ disabled: true });
    await denied(getBytes(f.object));
  });

  test(`${layout}: missing profile MUST reject upload`, async () => {
    const f = await fixture(legacy);
    await f.profile.delete();
    await denied(f.upload());
  });

  test(`${layout}: existing session and recording deletion upload guards remain enforced`, async () => {
    const f = await fixture(legacy);
    await f.session.update({ deleting: true });
    await denied(f.upload());
    await f.session.update({ deleting: false });
    await f.recording.update({ deleting: true });
    await denied(f.upload());
  });
}

test("suspended profile MUST reject recording deletion before any destructive work", async () => {
  const f = await fixture();
  await f.upload();
  await f.profile.update({ disabled: true });
  const remove = createRecordingDeletion({ db, bucket: getAdminStorage(app).bucket(), logger });
  await denied(remove(f.request));
  assert.equal((await f.recording.get()).exists, true);
});

test("suspended profile MUST reject an otherwise eligible AI retry", async () => {
  const f = await fixture();
  await f.recording.update({
    processingStatus: "failed", processingError: { stage: "analysis" },
    transcript: { originalText: "Today we explain how regular speaking practice and feedback help students improve their presentations." },
    metrics: { wordCount: 17, wordsPerMinute: 34, fillerCount: 0, fillerWords: {}, targetDurationStatus: null },
  });
  await f.profile.update({ disabled: true });
  await denied(createAnalysisRetry({ db, logger })(f.request));
});

test("a previously issued download URL MUST stop working even after all rule reads are denied", async () => {
  const id = "demo-speaksharp-token-audit";
  const env = await environment(id);
  const object = ref(env.authenticatedContext("owner").storage(`gs://${id}.appspot.com`), "recordings/owner/session/recording.m4a");
  await env.withSecurityRulesDisabled(async (context) => {
    await uploadBytes(ref(context.storage(`gs://${id}.appspot.com`), object.fullPath), new Uint8Array([1, 2, 3]));
  });
  const url = await getDownloadURL(object);
  assert.equal(new URL(url).origin, "http://127.0.0.1:9195");
  // Stronger than any profile-aware read rule; isolated bucket only.
  await environment(id, "rules_version = '2'; service firebase.storage { match /b/{bucket}/o { match /{file=**} { allow read, write: if false; } } }");
  await denied(getBytes(object));
  const withoutToken = new URL(url);
  withoutToken.searchParams.delete("token");
  assert.equal((await fetch(withoutToken, { cache: "no-store" })).status, 403);
  // No Authorization header: this is a new request using only the saved URL.
  assert.equal((await fetch(url, { cache: "no-store" })).status, 403,
    "Stored bearer URL still authorizes a new download despite deny-all rules");
});

test("emulator conformance: the documented two-document limit MUST reject a third lookup", async () => {
  const id = "demo-speaksharp-lookup-audit";
  const candidate = storageRules.replace("return recordingId is string", "return firestore.get(/databases/(default)/documents/users/$(uid)).data.disabled == false && recordingId is string");
  assert.notEqual(candidate, storageRules);
  const env = await environment(id);
  await db.doc("users/owner").set({ disabled: false });
  await db.doc("users/owner/sessions/session").set({ deleting: false });
  await db.doc("users/owner/sessions/session/recordings/recording").set({
    userId: "owner", sessionId: "session", audioPath: "recordings/owner/session/recording.m4a",
    processingStatus: "pending_upload", deleting: false,
  });
  const object = ref(env.authenticatedContext("owner").storage(`gs://${id}.appspot.com`), "recordings/owner/session/recording.m4a");
  // Prove the fixture is valid with the original two-lookups rule first.
  await uploadBytes(object, new Uint8Array([1, 2, 3]), {
    contentType: "audio/mp4", customMetadata: { recordingId: "recording" },
  });
  await environment(id, candidate);
  await denied(uploadBytes(object, new Uint8Array([1, 2, 3]), {
    contentType: "audio/mp4", customMetadata: { recordingId: "recording" },
  }));
});

after(async () => {
  await Promise.all(environments.map((env) => env.cleanup()));
  await deleteApp(app);
});
