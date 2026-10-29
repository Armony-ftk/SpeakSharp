const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createRecordingDeletion } = require("../recordingDeletion");
const { deleteRecording } = require("../deleteRecording");

const sessionPath = "users/owner/sessions/session";
const recordingPath = `${sessionPath}/recordings/target`;
const request = { auth: { uid: "owner" }, data: { sessionId: "session", recordingId: "target" } };
function fixture() {
  const documents = new Map([[sessionPath, { title: "Keep", status: "active", attemptCount: 0,
    ratingSum: 24, bestRating: 9, latestRating: 9 }]]);
  for (const [id, rating, createdAt] of [["old", 8, 1], ["middle", 7, 2], ["target", 9, 3]]) {
    documents.set(`${sessionPath}/recordings/${id}`, { userId: "owner", sessionId: "session", createdAt,
      audioPath: `recordings/owner/session/${id}.m4a`, processingStatus: "completed",
      aiFeedback: { overallRating: rating }, transcript: { originalText: "private" }, metrics: { wordCount: 10 } });
  }
  const objects = new Set([...documents.values()].map((data) => data.audioPath).filter(Boolean));
  const state = { deletes: [], logs: [], commits: 0 };
  const snapshot = (path) => ({ id: path.split("/").at(-1), exists: documents.has(path), data: () => documents.get(path) });
  const reference = (path) => ({ path, collection: (name) => ({
    doc: (id) => reference(`${path}/${name}/${id}`), orderBy: () => ({ queryPath: `${path}/${name}/` }),
  }) });
  let queue = Promise.resolve();
  const db = { doc: reference, runTransaction(callback) {
    const next = queue.then(async () => {
      const writes = [];
      const result = await callback({
        get: async (ref) => ref.queryPath ? { docs: [...documents.keys()].filter((p) => p.startsWith(ref.queryPath))
          .sort((a, b) => documents.get(b).createdAt - documents.get(a).createdAt).map(snapshot) } : snapshot(ref.path),
        update: (ref, data) => writes.push({ path: ref.path, data }),
        delete: (ref) => writes.push({ path: ref.path, remove: true }),
      });
      if (state.failClaim || (state.failCommit && writes.some((write) => write.remove))) throw new Error("private database details");
      for (const write of writes) {
        if (write.remove) { documents.delete(write.path); state.commits++; }
        else Object.assign(documents.get(write.path), write.data);
      }
      return result;
    });
    queue = next.catch(() => {});
    return next;
  } };
  const bucket = { file: (path) => ({ delete: async (options) => {
    assert.equal(options.ignoreNotFound, true);
    assert.equal(documents.get(recordingPath)?.deleting ?? true, true);
    if (state.storageError) throw state.storageError;
    state.deletes.push(path); objects.delete(path);
    if (state.duringStorage) await state.duringStorage();
  } }) };
  const logger = { info: (...args) => state.logs.push(args), error: (...args) => state.logs.push(args) };
  const remove = createRecordingDeletion({ db, bucket, logger });
  return { documents, objects, state, remove: (input = request) => remove(input),
    data: () => documents.get(recordingPath), session: () => documents.get(sessionPath) };
}

test("owner removes exactly one audio/document and recalculates highest/latest while preserving other data", async () => {
  const f = fixture();
  const sibling = structuredClone(f.documents.get(`${sessionPath}/recordings/old`));
  f.documents.set("users/other/sessions/other", { title: "Unrelated" });
  assert.equal((await f.remove()).success, true);
  assert.equal(f.data(), undefined);
  assert.deepEqual(f.state.deletes, ["recordings/owner/session/target.m4a"]);
  assert.deepEqual([f.session().ratingSum, f.session().bestRating, f.session().latestRating], [15, 8, 7]);
  assert.equal(f.session().attemptCount, 0); assert.equal(f.session().title, "Keep");
  assert.deepEqual(f.documents.get(`${sessionPath}/recordings/old`), sibling);
  assert.ok(f.objects.has(sibling.audioPath));
  assert.deepEqual(f.documents.get("users/other/sessions/other"), { title: "Unrelated" });
});

test("authentication, strict IDs and authenticated hierarchy reject unowned requests", async () => {
  const f = fixture();
  await assert.rejects(f.remove({ data: request.data }), { code: "unauthenticated" });
  for (const id of [null, 1, "", " ", " target", "../target", "a/b", "a\\b", ".", "..", "__bad__", "a".repeat(1501)]) {
    await assert.rejects(f.remove({ ...request, data: { ...request.data, recordingId: id } }), { code: "invalid-argument" });
  }
  await assert.rejects(f.remove({ ...request, auth: { uid: "other" } }), { code: "not-found" });
  f.data().userId = "other";
  await assert.rejects(f.remove(), { code: "permission-denied" });
  f.data().userId = "owner"; f.session().userId = "other";
  await assert.rejects(f.remove(), { code: "permission-denied" });
  assert.equal(f.state.deletes.length, 0);
});

test("untrusted saved paths cannot delete another object; client UID and path are ignored", async () => {
  for (const path of ["recordings/other/session/target.m4a", "recordings/owner/session/old.m4a", "gs://bucket/file", ""]) {
    const f = fixture(); f.data().audioPath = path;
    await assert.rejects(f.remove(), { code: "failed-precondition" });
    assert.equal(f.data().deleting, undefined); assert.equal(f.state.deletes.length, 0);
  }
  const f = fixture();
  await f.remove({ ...request, data: { ...request.data, uid: "other", audioPath: "recordings/owner/session/old.m4a" } });
  assert.ok(f.objects.has("recordings/owner/session/old.m4a"));
});

test("missing audio, missing path, legacy pending and every processing stage can be deleted", async () => {
  for (const status of ["pending_upload", "failed", "transcribing", "transcript_ready", "analysing", "completed"]) {
    const f = fixture(); f.data().processingStatus = status; f.objects.clear();
    await f.remove(); assert.equal(f.data(), undefined);
  }
  const missing = fixture(); delete missing.data().audioPath;
  await missing.remove(); assert.equal(missing.state.deletes.length, 2);
  const legacy = fixture(); Object.assign(legacy.data(), { status: "pending_upload",
    storagePath: "users/owner/sessions/session/recordings/target.m4a" });
  for (const key of ["processingStatus", "audioPath", "userId", "sessionId"]) delete legacy.data()[key];
  await legacy.remove(); assert.deepEqual(legacy.state.deletes, ["users/owner/sessions/session/recordings/target.m4a"]);
});

test("last eligible rating resets aggregates; invalid and incomplete ratings are excluded, zero is eligible", async () => {
  const f = fixture();
  f.documents.get(`${sessionPath}/recordings/old`).processingStatus = "analysing";
  f.documents.get(`${sessionPath}/recordings/middle`).aiFeedback.overallRating = "7";
  await f.remove();
  assert.deepEqual([f.session().ratingSum, f.session().bestRating, f.session().latestRating], [0, null, null]);
  const zero = fixture();
  zero.documents.get(`${sessionPath}/recordings/middle`).aiFeedback.overallRating = 0;
  await zero.remove(); assert.equal(zero.session().latestRating, 0);
});

test("duplicate and concurrent deletion requests commit aggregates only once", async () => {
  const f = fixture();
  await Promise.all([f.remove(), f.remove(), f.remove()]);
  assert.equal((await f.remove()).alreadyDeleted, true);
  assert.equal(f.state.commits, 1); assert.equal(f.session().ratingSum, 15);
});

test("Storage errors preserve metadata/ratings and deletion marker for a successful retry", async () => {
  for (const code of [403, 500, 503]) {
    const f = fixture(); f.state.storageError = Object.assign(new Error("private service response"), { code });
    await assert.rejects(f.remove(), { code: "unavailable" });
    assert.equal(f.data().deleting, true); assert.equal(f.session().ratingSum, 24);
    assert.ok(f.objects.has(f.data().audioPath));
    delete f.state.storageError; await f.remove(); assert.equal(f.session().ratingSum, 15);
    assert.ok(!JSON.stringify(f.state.logs).includes("private"));
  }
});

test("Firestore failures leave atomic ratings and retryable metadata even after audio removal", async () => {
  const f = fixture(); f.state.failCommit = true;
  await assert.rejects(f.remove(), { code: "unavailable" });
  assert.equal(f.data().deleting, true); assert.equal(f.session().ratingSum, 24);
  assert.ok(!f.objects.has(f.data().audioPath));
  f.state.failCommit = false; await f.remove(); assert.equal(f.session().ratingSum, 15);
  const claim = fixture(); claim.state.failClaim = true;
  await assert.rejects(claim.remove(), { code: "unavailable" });
  assert.equal(claim.data().deleting, undefined); assert.equal(claim.state.deletes.length, 0);
});

test("a missing recording is idempotent and a session being deleted cannot be recreated", async () => {
  const f = fixture(); f.documents.delete(recordingPath);
  await f.remove(); assert.equal(f.state.deletes.length, 0); assert.equal(f.session().ratingSum, 24);
  const deleting = fixture(); deleting.session().deleting = true;
  await assert.rejects(deleting.remove(), { code: "failed-precondition" });
  assert.equal(deleting.state.deletes.length, 0);
});

test("callable uses us-central1 and needs no provider secret", () => {
  assert.deepEqual(deleteRecording.__endpoint.region, ["us-central1"]);
  assert.ok(!deleteRecording.__endpoint.secretEnvironmentVariables?.length);
});
