const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { initializeApp: initializeAdminApp, deleteApp: deleteAdminApp } = require("firebase-admin/app");
const { getFirestore: getAdminFirestore } = require("firebase-admin/firestore");
const { getStorage: getAdminStorage } = require("firebase-admin/storage");
const { initializeApp, deleteApp } = require("firebase/app");
const { getFirestore, connectFirestoreEmulator, doc, setDoc, updateDoc, getDoc, serverTimestamp, deleteField } = require("firebase/firestore");
const { getStorage, connectStorageEmulator, ref, uploadBytes } = require("firebase/storage");

// Deliberately refuse to run these writes against any real Firebase project.
const projectId = "demo-speaksharp";
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost):8085$/);
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST ?? "", /^(127\.0\.0\.1|localhost):9195$/);
const adminApp = initializeAdminApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const adminDb = getAdminFirestore(adminApp);
const apps = [];
function client(uid) {
  const app = initializeApp({ projectId, apiKey: "emulator-only", storageBucket: `${projectId}.appspot.com` }, uid);
  apps.push(app);
  const db = getFirestore(app);
  const storage = getStorage(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8085, { mockUserToken: { sub: uid } });
  connectStorageEmulator(storage, "127.0.0.1", 9195, { mockUserToken: { sub: uid } });
  return { db, storage };
}
const owner = client("owner");
const other = client("other");
const sessionPath = "users/owner/sessions/session";
let counter = 0;
const session = {
  title: "Presentation", context: null, targetDurationSeconds: null, presentationDate: null,
  status: "active", attemptCount: 0, latestRating: null, bestRating: null, ratingSum: 0,
  createdAt: new Date(), updatedAt: new Date(),
};
async function setup() {
  await adminDb.doc(sessionPath).set(session);
  const id = `recording-${++counter}`;
  const path = `${sessionPath}/recordings/${id}`;
  const data = {
    userId: "owner", sessionId: "session", audioPath: `recordings/owner/session/${id}.m4a`,
    durationSeconds: 900, processingStatus: "pending_upload",
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  };
  return { id, path, data, reference: doc(owner.db, path) };
}
async function denied(promise) {
  await assert.rejects(promise, (error) => /permission-denied|unauthorized/.test(error.code));
}
const upload = (client, data, id, bytes = new Uint8Array(12), extra = {}) => uploadBytes(ref(client.storage, data.audioPath), bytes,
  { contentType: "audio/mp4", customMetadata: { recordingId: id }, ...extra });

after(async () => {
  await Promise.all(apps.map(deleteApp));
  await deleteAdminApp(adminApp);
});

test("owner can create canonical metadata and upload a linked m4a; others cannot", async () => {
  const f = await setup();
  await setDoc(f.reference, f.data);
  await upload(owner, f.data, f.id);
  await denied(getDoc(doc(other.db, f.path)));
  await denied(upload(other, f.data, f.id));
});

test("generated fields and forged statuses are rejected on create and update", async () => {
  for (const forged of [{ processingStatus: "transcript_ready" }, { transcript: { originalText: "fake" } },
    { status: "pending_upload" }, { metrics: {} }, { analysis: {} }, { transcriptionJob: { generation: "123" } }]) {
    const f = await setup();
    await denied(setDoc(f.reference, { ...f.data, ...forged }));
    await setDoc(f.reference, f.data);
    await denied(updateDoc(f.reference, { ...forged, updatedAt: serverTimestamp() }));
  }
});

test("upload timestamp update is allowed even when the backend finishes first", async () => {
  const f = await setup(); await setDoc(f.reference, f.data);
  await adminDb.doc(f.path).update({ processingStatus: "transcript_ready", transcript: { originalText: "real" } });
  await updateDoc(f.reference, { uploadedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  assert.equal((await getDoc(f.reference)).data().transcript.originalText, "real");
  await denied(updateDoc(f.reference, { processingStatus: "pending_upload" }));
});

test("legacy upgrade retains existing fields, removes aliases, and uses the original path", async () => {
  const f = await setup();
  const audioPath = `users/owner/sessions/session/recordings/${f.id}.m4a`;
  await adminDb.doc(f.path).set({ duration: 30, status: "pending_upload", storagePath: audioPath,
    createdAt: new Date(), updatedAt: new Date(), personalNote: "keep" });
  await updateDoc(f.reference, {
    userId: "owner", sessionId: "session", durationSeconds: 30, audioPath,
    processingStatus: "pending_upload", duration: deleteField(), status: deleteField(),
    storagePath: deleteField(), updatedAt: serverTimestamp(),
  });
  assert.equal((await getDoc(f.reference)).data().personalNote, "keep");
  await upload(owner, { audioPath }, f.id);
});

test("unlinked objects, mismatched metadata, unsupported types, and oversize audio are denied", async () => {
  const f = await setup();
  await denied(upload(owner, f.data, f.id));
  await setDoc(f.reference, f.data);
  await denied(upload(owner, f.data, "wrong"));
  await denied(upload(owner, f.data, f.id, new Uint8Array(12), { contentType: "image/png" }));
  await denied(upload(owner, f.data, f.id, new Uint8Array(0)));
  await denied(upload(owner, f.data, f.id, new Uint8Array(32 * 1024 * 1024 + 1)));
});

test("transcribing and completed audio cannot be overwritten; failed audio can be retried", async () => {
  const f = await setup(); await setDoc(f.reference, f.data); await upload(owner, f.data, f.id);
  for (const processingStatus of ["transcribing", "transcript_ready", "analysing", "completed"]) {
    await adminDb.doc(f.path).update({ processingStatus });
    await denied(upload(owner, f.data, f.id));
  }
  await adminDb.doc(f.path).update({ processingStatus: "failed" });
  await upload(owner, f.data, f.id);
});

test("deleting session blocks new recordings, uploads, receipts, and clearing deletion marker", async () => {
  const f = await setup(); await setDoc(f.reference, f.data);
  await adminDb.doc(sessionPath).update({ deleting: true });
  await denied(setDoc(doc(owner.db, `${sessionPath}/recordings/new-id`), { ...f.data, audioPath: "recordings/owner/session/new-id.m4a" }));
  await denied(upload(owner, f.data, f.id));
  await denied(updateDoc(f.reference, { uploadedAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await denied(setDoc(doc(owner.db, sessionPath), { ...session, updatedAt: serverTimestamp() }));
});

test("unchanged owner session CRUD remains allowed outside deletion", async () => {
  await setup();
  await updateDoc(doc(owner.db, sessionPath), { title: "Updated", status: "completed", updatedAt: serverTimestamp() });
  assert.equal((await getDoc(doc(owner.db, sessionPath))).data().title, "Updated");
  await denied(updateDoc(doc(other.db, sessionPath), { title: "Unowned", updatedAt: serverTimestamp() }));
});

test("real Firestore transactions deduplicate concurrent mocked transcription events", async () => {
  const { createTranscriptionProcessor } = require("../transcriptionProcessor");
  const f = await setup(); await setDoc(f.reference, f.data);
  await adminDb.doc(f.path).update({ "metrics.uniqueWords": 4, "metrics.custom": "keep" });
  const audio = Buffer.from("0000ftypM4A ");
  let requests = 0;
  const process = createTranscriptionProcessor({
    db: adminDb, bucketName: `${projectId}.appspot.com`,
    downloadAudio: async () => audio,
    transcribe: async () => {
      requests++;
      assert.equal((await adminDb.doc(f.path).get()).data().processingStatus, "transcribing");
      return { metadata: { duration: 10 }, results: { channels: [{ alternatives: [{ transcript: "Um, a real transaction test." }] }] } };
    },
    logger: { info() {}, warn() {}, error() {} },
  });
  const event = { data: { name: f.data.audioPath, bucket: `${projectId}.appspot.com`, generation: "100",
    size: String(audio.length), contentType: "audio/mp4" } };
  await Promise.all([process(event), process(event), process(event)]);
  const saved = (await getDoc(f.reference)).data();
  assert.equal(requests, 1);
  assert.equal(saved.processingStatus, "transcript_ready");
  assert.equal(saved.transcript.originalText, "Um, a real transaction test.");
  assert.deepEqual(saved.metrics, {
    uniqueWords: 4, custom: "keep", wordCount: 5, wordsPerMinute: 0.3,
    fillerCount: 1, fillerWords: { um: 1 }, targetDurationStatus: null,
  });
  assert.equal(saved.durationSeconds, 900);
  const version = (await adminDb.doc(f.path).get()).updateTime;
  await process(event);
  assert.ok(version.isEqual((await adminDb.doc(f.path).get()).updateTime));
  await denied(updateDoc(f.reference, { "metrics.wordCount": 999 }));
});

test("existing callable authentication and cascade remove both audio layouts and child documents", async () => {
  const { deleteSession } = require("../deletion");
  const f = await setup(); await setDoc(f.reference, f.data); await upload(owner, f.data, f.id);
  const oldId = "legacy-deletion";
  const oldAudioPath = `users/owner/sessions/session/recordings/${oldId}.m4a`;
  await adminDb.doc(`${sessionPath}/recordings/${oldId}`).set({
    ...f.data, audioPath: oldAudioPath, createdAt: new Date(), updatedAt: new Date(),
  });
  await upload(owner, { audioPath: oldAudioPath }, oldId);
  await assert.rejects(deleteSession.run({ data: { sessionId: "session" } }), (error) => error.code === "unauthenticated");
  await assert.rejects(deleteSession.run({ auth: { uid: "other" }, data: { sessionId: "session" } }), (error) => error.code === "not-found");
  const result = await deleteSession.run({ auth: { uid: "owner" }, data: { sessionId: "session" } });
  assert.equal(result.success, true);
  assert.equal((await adminDb.doc(sessionPath).get()).exists, false);
  assert.equal((await adminDb.doc(f.path).get()).exists, false);
  assert.equal((await adminDb.collection(`${sessionPath}/recordings`).get()).size, 0);
  const bucket = getAdminStorage(adminApp).bucket();
  assert.equal((await bucket.file(f.data.audioPath).exists())[0], false);
  assert.equal((await bucket.file(oldAudioPath).exists())[0], false);
});
