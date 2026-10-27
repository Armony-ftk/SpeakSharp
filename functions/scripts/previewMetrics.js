const { calculateSpeakingMetrics } = require("../speakingMetrics");

function validateIds(ids) {
  for (const name of ["userId", "sessionId", "recordingId"]) {
    const value = ids[name];
    if (typeof value !== "string" || !value.trim() || value.includes("/")
      || value === "." || value === "..") {
      throw new Error(`A valid ${name} document ID is required (no slashes).`);
    }
  }
}

async function previewMetrics(db, ids) {
  validateIds(ids);
  const { userId, sessionId, recordingId } = ids;
  const sessionRef = db.doc(`users/${userId}/sessions/${sessionId}`);
  const recordingRef = db.doc(`${sessionRef.path}/recordings/${recordingId}`);
  const [session, recording] = await db.getAll(sessionRef, recordingRef);
  if (!session.exists) throw new Error("The parent session document does not exist.");
  if (!recording.exists) throw new Error("The recording document does not exist.");

  const data = recording.data();
  const metrics = calculateSpeakingMetrics({
    originalText: data.transcript?.originalText,
    durationSeconds: data.durationSeconds,
    targetDurationSeconds: session.data().targetDurationSeconds,
  });

  // Compare Firestore's server update times, not the optional application updatedAt field.
  const [sessionAfter, recordingAfter] = await db.getAll(sessionRef, recordingRef);
  if (!sessionAfter.exists || !recordingAfter.exists
    || !session.updateTime.isEqual(sessionAfter.updateTime)
    || !recording.updateTime.isEqual(recordingAfter.updateTime)) {
    throw new Error("Source documents changed during this read-only preview. Retry when they are stable.");
  }

  return { userId, sessionId, recordingId, metrics, sourceDocumentsUnchanged: true };
}

async function main() {
  const [projectId, userId, sessionId, recordingId, ...extra] = process.argv.slice(2);
  if (!projectId || !userId || !sessionId || !recordingId || extra.length) {
    throw new Error("Usage: npm run metrics:preview -- <projectId> <userId> <sessionId> <recordingId>");
  }
  const ids = { userId, sessionId, recordingId };
  validateIds(ids);

  // Do not import index.js: this standalone tool must not load Cloud Function handlers.
  const { initializeApp, deleteApp } = require("firebase-admin/app");
  const { getFirestore } = require("firebase-admin/firestore");
  const app = initializeApp({ projectId });
  const db = getFirestore(app);
  try {
    const result = await previewMetrics(db, ids);
    console.log(JSON.stringify({
      projectId,
      source: process.env.FIRESTORE_EMULATOR_HOST ? "emulator" : "firestore",
      ...result,
    }, null, 2));
  } finally {
    try {
      await db.terminate();
    } finally {
      await deleteApp(app);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Metrics preview failed: ${error.message}`);
    console.error("For local Firestore access, configure Application Default Credentials and read IAM access. See docs/speaking-metrics.md.");
    process.exitCode = 1;
  });
}

module.exports = { previewMetrics };
