const { test } = require("node:test");
const assert = require("node:assert/strict");
const { previewMetrics } = require("../scripts/previewMetrics");

const ids = { userId: "owner", sessionId: "session", recordingId: "recording" };
const paths = ["users/owner/sessions/session", "users/owner/sessions/session/recordings/recording"];

function fixture(options = {}) {
  const documents = [
    { targetDurationSeconds: 60 },
    { transcript: { originalText: "Um, hello world." }, durationSeconds: 60,
      processingStatus: "transcript_ready", metrics: { preserved: true } },
  ];
  let reads = 0;
  // Only document references and reads are available: any write would fail this test.
  const db = {
    doc: (path) => ({ path }),
    async getAll(...references) {
      assert.deepEqual(references.map((ref) => ref.path), paths);
      reads++;
      return documents.map((data, index) => ({
        exists: options.missing !== index && !(reads === 2 && options.deleted === index),
        data: () => structuredClone(data),
        updateTime: {
          version: reads === 2 && options.changed === index ? 2 : 1,
          isEqual(other) { return this.version === other.version; },
        },
      }));
    },
  };
  return { db, documents, reads: () => reads };
}

test("preview reads exact documents, preserves data, verifies versions and omits transcript", async () => {
  const f = fixture();
  const before = structuredClone(f.documents);
  const result = await previewMetrics(f.db, ids);
  assert.deepEqual(result, {
    ...ids,
    metrics: { durationSeconds: 60, wordCount: 3, wordsPerMinute: 3,
      fillerWordCount: 1, fillerBreakdown: { um: 1 }, targetDurationStatus: "close" },
    sourceDocumentsUnchanged: true,
  });
  assert.equal(f.reads(), 2);
  assert.deepEqual(f.documents, before);
  assert.ok(!JSON.stringify(result).includes("hello world"));
});

test("preview rejects invalid IDs before any reads", async () => {
  const f = fixture();
  for (const recordingId of [undefined, "", " ", "a/b", ".", ".."]) {
    await assert.rejects(previewMetrics(f.db, { ...ids, recordingId }), /valid recordingId/);
  }
  assert.equal(f.reads(), 0);
});

test("preview reports missing session or recording", async () => {
  await assert.rejects(previewMetrics(fixture({ missing: 0 }).db, ids), /parent session document does not exist/);
  await assert.rejects(previewMetrics(fixture({ missing: 1 }).db, ids), /recording document does not exist/);
});

test("preview rejects absent transcripts but accepts an existing empty transcript", async () => {
  const f = fixture();
  delete f.documents[1].transcript;
  await assert.rejects(previewMetrics(f.db, ids), /originalText must be a string/);
  f.documents[1].transcript = { originalText: "" };
  assert.equal((await previewMetrics(f.db, ids)).metrics.wordCount, 0);
});

test("preview uses canonical fields and does not invent a target or legacy duration", async () => {
  const f = fixture();
  delete f.documents[0].targetDurationSeconds;
  delete f.documents[1].durationSeconds;
  f.documents[1].duration = 60;
  const { metrics } = await previewMetrics(f.db, ids);
  assert.equal(metrics.durationSeconds, null);
  assert.equal(metrics.wordsPerMinute, null);
  assert.equal(metrics.targetDurationStatus, null);
});

test("preview detects concurrent edits or deletion of either source document", async () => {
  for (const index of [0, 1]) {
    await assert.rejects(previewMetrics(fixture({ changed: index }).db, ids), /Source documents changed/);
    await assert.rejects(previewMetrics(fixture({ deleted: index }).db, ids), /Source documents changed/);
  }
});

test("Firestore access errors propagate without a fabricated result", async () => {
  const f = fixture();
  f.db.getAll = async () => { throw new Error("PERMISSION_DENIED"); };
  await assert.rejects(previewMetrics(f.db, ids), /PERMISSION_DENIED/);
});
