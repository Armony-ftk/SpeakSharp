const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { initializeApp: clientApp, deleteApp: deleteClient } = require("firebase/app");
const { getFirestore: clientDb, connectFirestoreEmulator, doc, setDoc, serverTimestamp } = require("firebase/firestore");
const { getStorage: clientStorage, connectStorageEmulator, ref, uploadBytes } = require("firebase/storage");
const { getAuth: clientAuth, connectAuthEmulator, signInWithEmailAndPassword, reauthenticateWithCredential, EmailAuthProvider } = require("firebase/auth");
const { createAccountDeletion } = require("../accountDeletion");
const { createTranscriptionProcessor } = require("../transcriptionProcessor");
const { createAnalysisProcessor, createAnalysisRetry } = require("../analysisProcessor");
const { createGetUsers } = require("../adminUsers");
const { createFirestoreActivityPageProvider, createSessionCreatedHandler } = require("../adminActivity");

assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:8085");
assert.equal(process.env.FIREBASE_STORAGE_EMULATOR_HOST, "127.0.0.1:9195");
const projectId = "demo-speaksharp";
const bucketName = `${projectId}.appspot.com`;
const app = initializeApp({ projectId, storageBucket: bucketName }, "account-deletion-test");
const db = getFirestore(app), auth = getAuth(app), bucket = getStorage(app).bucket();
const logger = { error() {}, info() {}, warn() {} };
const clients = [];
after(async () => { await Promise.all(clients.map(deleteClient)); await db.terminate(); await deleteApp(app); });
let serial = 0;
async function fixture() {
  const uid = `account-delete-${++serial}`;
  await auth.createUser({ uid, email: `${uid}@example.test`, password: "Disposable-Password-42", emailVerified: true });
  const profileRef = db.doc(`users/${uid}`);
  await profileRef.set({ fullName: "Disposable user", email: `${uid}@example.test`, createdAt: Timestamp.now() });
  const sessionRef = profileRef.collection("sessions").doc("s");
  await sessionRef.set({ title: "Talk", context: null, targetDurationSeconds: 60, presentationDate: null,
    status: "active", attemptCount: 0, latestRating: null, bestRating: null, ratingSum: 0,
    createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  const recordingRef = sessionRef.collection("recordings").doc("r");
  const recording = { userId: uid, sessionId: "s", audioPath: `recordings/${uid}/s/r.m4a`,
    durationSeconds: 20, processingStatus: "pending_upload", createdAt: Timestamp.now(), updatedAt: Timestamp.now() };
  await recordingRef.set(recording);
  const request = { auth: { uid, token: { auth_time: Date.now() / 1000 } }, data: { receipt: serial.toString(16).padStart(64, "0") } };
  const remove = createAccountDeletion({ db, auth, bucket, logger });
  const client = clientApp({ projectId, apiKey: "emulator-only", storageBucket: bucketName }, uid);
  clients.push(client);
  const firestore = clientDb(client), storage = clientStorage(client);
  connectFirestoreEmulator(firestore, "127.0.0.1", 8085, { mockUserToken: { sub: uid } });
  connectStorageEmulator(storage, "127.0.0.1", 9195, { mockUserToken: { sub: uid } });
  return { uid, profileRef, sessionRef, recordingRef, recording, request, remove, firestore, storage, client };
}
const denied = (promise) => assert.rejects(promise, (e) => /permission-denied|unauthorized/.test(e.code));
const audio = Buffer.from("0000ftypM4A ");

test("actual password reauthentication supplies verified recent auth_time; deleted credentials cannot sign in", async () => {
  const f = await fixture();
  const identity = clientAuth(f.client);
  connectAuthEmulator(identity, "http://127.0.0.1:9099", { disableWarnings: true });
  const email = `${f.uid}@example.test`, password = "Disposable-Password-42";
  const { user } = await signInWithEmailAndPassword(identity, email, password);
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(email, password));
  const token = await auth.verifyIdToken(await user.getIdToken(true));
  assert.ok(Date.now() / 1000 - token.auth_time < 300);
  await f.remove({ ...f.request, auth: { uid: token.uid, token } });
  await assert.rejects(signInWithEmailAndPassword(identity, email, password),
    (e) => ["auth/user-not-found", "auth/invalid-credential", "auth/wrong-password"].includes(e.code));
});

test("real account cascade removes nested/orphan audio and Auth; admin directory drops user and historical events remain byte-for-byte", async () => {
  const f = await fixture();
  const other = await fixture();
  await f.recordingRef.collection("notes").doc("nested").set({ text: "private" });
  await f.profileRef.collection("sessions").doc("second").collection("recordings").doc("orphan-parent").set({ private: true });
  const paths = [f.recording.audioPath, `recordings/${f.uid}/orphan/interrupted.m4a`, `users/${f.uid}/sessions/old/recordings/legacy.m4a`];
  for (const path of paths) await bucket.file(path).save(audio, { contentType: "audio/mp4" });
  await bucket.file(other.recording.audioPath).save(audio);
  const historyRef = db.doc(`adminActivityLogs/deletion-history-${f.uid}`);
  await historyRef.set({ id: historyRef.id, userId: f.uid, userName: "Stored historical name", type: "Admin", action: "reactivate", occurredAt: Timestamp.now(), status: "success" });
  const before = await historyRef.get();
  assert.deepEqual(await f.remove(f.request), { success: true });
  assert.equal((await f.profileRef.get()).exists, false);
  assert.equal((await f.recordingRef.get()).exists, false);
  assert.deepEqual(await f.profileRef.listCollections(), []);
  for (const path of paths) assert.equal((await bucket.file(path).exists())[0], false);
  await assert.rejects(auth.getUser(f.uid), { code: "auth/user-not-found" });
  assert.ok((await auth.getUser(other.uid)).uid); assert.equal((await bucket.file(other.recording.audioPath).exists())[0], true);
  const afterEvent = await historyRef.get();
  assert.ok(before.updateTime.isEqual(afterEvent.updateTime)); assert.deepEqual(before.data(), afterEvent.data());
  const directory = createGetUsers({ requireAdmin: async () => ({}), getDb: () => db, getAuth: () => auth });
  const users = await directory({ data: {} });
  assert.ok(!users.items.some((user) => user.userId === f.uid));
  const activity = await createFirestoreActivityPageProvider({ getDb: () => db })({ userId: f.uid, pageSize: 20 });
  assert.equal(activity.events[0].userName, "Stored historical name");
  const confirm = await f.remove({ data: { confirmOnly: true, receipt: f.request.data.receipt } });
  assert.equal(confirm.success, true);
});

test("Storage failure retains Auth; rules block old-token profile/session/recording writes and both audio layouts; retry completes", async () => {
  const f = await fixture();
  const fail = createAccountDeletion({ db, auth, logger, bucket: { getFiles: async () => { throw new Error("Storage outage"); } } });
  await assert.rejects(fail(f.request), { code: "unavailable" });
  assert.ok((await auth.getUser(f.uid)).uid);
  assert.equal((await f.sessionRef.get()).data().deleting, true);
  await denied(setDoc(doc(f.firestore, f.sessionRef.path, "recordings", "new"), {
    ...f.recording, audioPath: `recordings/${f.uid}/s/new.m4a`, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  for (const legacy of [false, true]) {
    const audioPath = legacy ? `users/${f.uid}/sessions/s/recordings/r.m4a` : f.recording.audioPath;
    await f.recordingRef.update({ audioPath });
    await denied(uploadBytes(ref(f.storage, audioPath), audio, { contentType: "audio/mp4", customMetadata: { recordingId: "r" } }));
  }
  await f.remove(f.request);
  await denied(setDoc(doc(f.firestore, f.profileRef.path), { fullName: "Resurrected", email: "test@example.test", createdAt: serverTimestamp() }));
  await denied(setDoc(doc(f.firestore, f.sessionRef.path), { title: "Resurrected" }));
});

test("partial Firestore removal can resume without a profile and concurrent requests share the server lease", async () => {
  const f = await fixture();
  const failedDb = Object.create(db);
  failedDb.recursiveDelete = async () => { await f.profileRef.delete(); throw new Error("Interrupted recursion"); };
  await assert.rejects(createAccountDeletion({ db: failedDb, auth, bucket, logger })(f.request), { code: "unavailable" });
  assert.ok((await f.recordingRef.get()).exists); assert.ok((await auth.getUser(f.uid)).uid);
  let release, reached;
  const entered = new Promise((resolve) => { reached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const gatedBucket = { getFiles: async (options) => { reached(); await gate; return bucket.getFiles(options); } };
  const running = createAccountDeletion({ db, auth, bucket: gatedBucket, logger })(f.request);
  await entered;
  await assert.rejects(f.remove(f.request), { code: "aborted" });
  release(); await running;
  assert.equal((await f.recordingRef.get()).exists, false);
});

test("in-flight transcription, metrics and late upload finalization cannot recreate data", async () => {
  const f = await fixture(); let providerCalls = 0;
  const processor = createTranscriptionProcessor({ db, bucketName, logger, downloadAudio: async () => audio,
    deleteAudio: async (object) => bucket.file(object.name).delete({ ignoreNotFound: true }),
    transcribe: async () => {
      providerCalls++; await f.remove(f.request);
      return { metadata: { duration: 20 }, results: { channels: [{ alternatives: [{ transcript: "Today we discuss careful deletion." }] }] } };
    } });
  const event = { data: { bucket: bucketName, name: f.recording.audioPath, generation: "1", size: String(audio.length), contentType: "audio/mp4" } };
  await processor(event);
  assert.equal((await f.recordingRef.get()).exists, false); assert.equal((await f.sessionRef.get()).exists, false);
  await bucket.file(f.recording.audioPath).save(audio); // Simulate a late, preauthorized upload.
  await processor(event);
  assert.equal(providerCalls, 1); assert.equal((await bucket.file(f.recording.audioPath).exists())[0], false);
});

test("in-flight AI completion/failure and explicit retry cannot write after account deletion", async () => {
  const f = await fixture();
  await f.recordingRef.update({ processingStatus: "transcript_ready", transcript: { originalText: "Today I explain a clear presentation. Practice helps us improve. Please ask a friend for feedback." },
    metrics: { wordCount: 18, wordsPerMinute: 54, fillerCount: 0, fillerWords: {}, targetDurationStatus: "under" } });
  const afterData = (await f.recordingRef.get()).data(); let generated = 0;
  await createAnalysisProcessor({ db, logger, generate: async () => { generated++; await f.remove(f.request); throw new Error("Provider completion after deletion"); } })({
    params: { userId: f.uid, sessionId: "s", recordingId: "r" },
    data: { before: { data: () => ({ processingStatus: "pending_upload" }) }, after: { data: () => afterData } } });
  assert.equal(generated, 1); assert.equal((await f.recordingRef.get()).exists, false); assert.equal((await f.sessionRef.get()).exists, false);
  await assert.rejects(createAnalysisRetry({ db, logger })({ auth: { uid: f.uid }, data: { sessionId: "s", recordingId: "r" } }), { code: "not-found" });
});

test("session activity redelivery after profile removal preserves the original historical record", async () => {
  const f = await fixture();
  const handler = createSessionCreatedHandler({ getDb: () => db, getOccurredAt: () => Timestamp.now() });
  const event = { params: { userId: f.uid, sessionId: "s" } };
  await handler(event);
  const ref = db.doc(`adminActivityLogs/session_created_${f.uid}_s`), before = await ref.get();
  await f.remove(f.request); await handler(event);
  const afterEvent = await ref.get();
  assert.deepEqual(before.data(), afterEvent.data()); assert.ok(before.updateTime.isEqual(afterEvent.updateTime));
});
