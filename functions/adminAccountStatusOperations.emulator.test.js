const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { after, test } = require("node:test");

const EMULATOR_HOST = "127.0.0.1:8080";
const PROJECT_ID = "speaksharp-account-status-concurrency-test";

// Force this test to use only the local Firestore Emulator. If it is not
// running, the test fails rather than falling back to a remote project.
process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
process.env.GCLOUD_PROJECT = PROJECT_ID;

const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const {
  LOCK_COLLECTION,
  OPERATION_COLLECTION,
  createAccountStatusOperationManager,
} = require("./adminAccountStatusOperations");

const app = initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

function operationId() {
  return `op_${randomUUID()}`;
}

test("concurrent claims leave one pending operation and one matching lock", async () => {
  const targetUserId = `concurrency-target-${randomUUID()}`;
  const firstOperationId = operationId();
  const secondOperationId = operationId();
  const manager = createAccountStatusOperationManager({ getDb: () => db });

  const claims = await Promise.allSettled([
    manager.claimOperation({
      operationId: firstOperationId,
      targetUserId,
      requestedDisabled: true,
      actorId: "emulator-admin-1",
    }),
    manager.claimOperation({
      operationId: secondOperationId,
      targetUserId,
      requestedDisabled: false,
      actorId: "emulator-admin-2",
    }),
  ]);

  try {
    const fulfilled = claims.filter((claim) => claim.status === "fulfilled");
    const rejected = claims.filter((claim) => claim.status === "rejected");

    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    assert.equal(fulfilled[0].value.status, "pending");
    assert.equal(rejected[0].reason.code, "failed-precondition");

    const operationSnapshots = await Promise.all(
      [firstOperationId, secondOperationId].map((id) =>
        db.collection(OPERATION_COLLECTION).doc(id).get(),
      ),
    );
    const storedOperations = operationSnapshots.filter((snapshot) =>
      snapshot.exists,
    );

    assert.equal(storedOperations.length, 1);
    assert.equal(storedOperations[0].data().status, "pending");

    const lockSnapshot = await db
      .collection(LOCK_COLLECTION)
      .doc(targetUserId)
      .get();
    assert.equal(lockSnapshot.exists, true);
    assert.equal(
      lockSnapshot.data().operationId,
      storedOperations[0].data().operationId,
    );
    assert.equal(lockSnapshot.data().targetUserId, targetUserId);
    assert.equal(lockSnapshot.data().status, "pending");
  } finally {
    const cleanupBatch = db.batch();
    cleanupBatch.delete(
      db.collection(OPERATION_COLLECTION).doc(firstOperationId),
    );
    cleanupBatch.delete(
      db.collection(OPERATION_COLLECTION).doc(secondOperationId),
    );
    cleanupBatch.delete(db.collection(LOCK_COLLECTION).doc(targetUserId));
    await cleanupBatch.commit();
  }
});

after(async () => {
  await deleteApp(app);
});
