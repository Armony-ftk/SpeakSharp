const assert = require("node:assert/strict");
const { test } = require("node:test");
const { HttpsError } = require("firebase-functions/v2/https");
const { Timestamp } = require("firebase-admin/firestore");

const {
  createAccountStatusOperationManager,
  validateOperationId,
} = require("./adminAccountStatusOperations");

const OPERATION_ID = "op_123e4567-e89b-42d3-a456-426614174000";

function createFakeDb(initial = {}) {
  const records = new Map(Object.entries(initial));
  const calls = [];

  function reference(path) {
    return { path };
  }

  return {
    calls,
    records,
    collection(name) {
      return {
        doc(id) {
          return reference(`${name}/${id}`);
        },
      };
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        async get(ref) {
          calls.push(["get", ref.path]);
          const value = records.get(ref.path);
          return {
            exists: value !== undefined,
            data: () => value,
          };
        },
        set(ref, value, options) {
          calls.push(["set", ref.path, value, options]);
          writes.push({ type: "set", ref, value, options });
        },
        delete(ref) {
          calls.push(["delete", ref.path]);
          writes.push({ type: "delete", ref });
        },
      };

      const result = await callback(transaction);

      for (const write of writes) {
        if (write.type === "delete") {
          records.delete(write.ref.path);
        } else {
          const previous = records.get(write.ref.path);
          records.set(
            write.ref.path,
            write.options?.merge
              ? { ...previous, ...write.value }
              : write.value,
          );
        }
      }

      return result;
    },
  };
}

function managerFor(db) {
  return createAccountStatusOperationManager({
    getDb: () => db,
    now: () => new Timestamp(100, 200),
  });
}

async function expectCode(promise, code) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.code, code);
    return true;
  });
}

test("accepts only op_-prefixed UUID v4 operation IDs", () => {
  assert.equal(validateOperationId(OPERATION_ID), OPERATION_ID);

  for (const value of [
    "",
    "operation-1",
    "op_123e4567-e89b-12d3-a456-426614174000",
    "op_123e4567-e89b-42d3-7456-426614174000",
  ]) {
    assert.throws(
      () => validateOperationId(value),
      (error) => error instanceof HttpsError && error.code === "invalid-argument",
    );
  }
});

test("claims an operation and binds it to target, state, and actor", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);

  const result = await manager.claimOperation({
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  });

  assert.deepEqual(result, {
    status: "pending",
    result: null,
    claimed: true,
  });
  assert.deepEqual(db.records.get(`adminAccountStatusOperations/${OPERATION_ID}`), {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
    status: "pending",
    stage: "claimed",
    createdAt: new Timestamp(100, 200),
    updatedAt: new Timestamp(100, 200),
    failureStage: null,
    result: null,
  });
  assert.equal(
    db.records.get("adminAccountStatusLocks/user-1").operationId,
    OPERATION_ID,
  );
  assert.deepEqual(
    db.calls.slice(0, 2),
    [
      ["get", `adminAccountStatusOperations/${OPERATION_ID}`],
      ["get", "adminAccountStatusLocks/user-1"],
    ],
  );
});

test("same-ID retries return the existing pending operation", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };

  await manager.claimOperation(binding);
  const retry = await manager.claimOperation(binding);

  assert.deepEqual(retry, {
    status: "pending",
    result: null,
    claimed: false,
  });
});

test("rejects reuse of an operation ID with different binding", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);

  await manager.claimOperation({
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  });

  await expectCode(
    manager.claimOperation({
      operationId: OPERATION_ID,
      targetUserId: "user-2",
      requestedDisabled: true,
      actorId: "admin-1",
    }),
    "permission-denied",
  );

  await expectCode(
    manager.claimOperation({
      operationId: OPERATION_ID,
      targetUserId: "user-1",
      requestedDisabled: false,
      actorId: "admin-1",
    }),
    "permission-denied",
  );

  await expectCode(
    manager.claimOperation({
      operationId: OPERATION_ID,
      targetUserId: "user-1",
      requestedDisabled: true,
      actorId: "admin-2",
    }),
    "permission-denied",
  );
});

test("rejects a competing operation for a locked user", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);

  await manager.claimOperation({
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  });

  await expectCode(
    manager.claimOperation({
      operationId: "op_123e4567-e89b-42d3-a456-426614174001",
      targetUserId: "user-1",
      requestedDisabled: false,
      actorId: "admin-1",
    }),
    "failed-precondition",
  );
});

test("completion atomically stores the result and event, then releases the lock", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };

  await manager.claimOperation(binding);

  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  assert.deepEqual(
    await manager.completeOperation({ ...binding, result, activity }),
    result,
  );
  assert.equal(
    db.records.get(`adminAccountStatusOperations/${OPERATION_ID}`).status,
    "completed",
  );
  assert.equal(
    db.records.get(`adminActivityLogs/admin_status_${OPERATION_ID}`).id,
    activity.id,
  );
  assert.equal(db.records.has("adminAccountStatusLocks/user-1"), false);
});

test("completed retries return the stored result without duplicating the event", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  await manager.completeOperation({ ...binding, result, activity });
  const eventBeforeRetry = db.records.get(
    `adminActivityLogs/admin_status_${OPERATION_ID}`,
  );

  assert.deepEqual(
    await manager.completeOperation({
      ...binding,
      result: { ...result, updatedAt: "2026-10-29T12:01:00.000Z" },
      activity,
    }),
    result,
  );
  assert.deepEqual(
    db.records.get(`adminActivityLogs/admin_status_${OPERATION_ID}`),
    eventBeforeRetry,
  );
});

test("direct completion retries reject a malformed stored result without changing completion state", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  await manager.completeOperation({ ...binding, result, activity });

  const eventBeforeRetry = db.records.get(
    `adminActivityLogs/admin_status_${OPERATION_ID}`,
  );
  const malformedOperation = {
    ...db.records.get(`adminAccountStatusOperations/${OPERATION_ID}`),
    result: {
      userId: "different-user",
      accountStatus: "active",
      updatedAt: "not-a-timestamp",
    },
  };
  db.records.set(
    `adminAccountStatusOperations/${OPERATION_ID}`,
    malformedOperation,
  );

  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );

  assert.deepEqual(
    db.records.get(`adminAccountStatusOperations/${OPERATION_ID}`),
    malformedOperation,
  );
  assert.deepEqual(
    db.records.get(`adminActivityLogs/admin_status_${OPERATION_ID}`),
    eventBeforeRetry,
  );
  assert.equal(db.records.has("adminAccountStatusLocks/user-1"), false);
});

test("completed claims require a matching deterministic activity event", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  await manager.completeOperation({ ...binding, result, activity });

  assert.deepEqual(await manager.claimOperation(binding), {
    status: "completed",
    result,
    claimed: false,
  });

  db.records.delete(`adminActivityLogs/admin_status_${OPERATION_ID}`);
  await expectCode(manager.claimOperation(binding), "failed-precondition");
});

test("completion rejects a lock with a mismatched target or status", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  db.records.set("adminAccountStatusLocks/user-1", {
    operationId: OPERATION_ID,
    targetUserId: "different-user",
    status: "pending",
  });
  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );
  assert.equal(db.records.has("adminAccountStatusLocks/user-1"), true);

  db.records.set("adminAccountStatusLocks/user-1", {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    status: "repair-required",
  });
  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );
  assert.equal(db.records.has("adminAccountStatusLocks/user-1"), true);
});

test("completion rejects activity metadata that is forged or contains extra fields", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  await manager.claimOperation(binding);

  await expectCode(
    manager.completeOperation({
      ...binding,
      result,
      activity: {
        id: `admin_status_${OPERATION_ID}`,
        userId: "user-2",
        type: "Admin",
        action: "suspend",
        actorId: "admin-1",
        status: "success",
        occurredAt: new Timestamp(101, 0),
        source: "trusted_function",
      },
    }),
    "invalid-argument",
  );

  await expectCode(
    manager.completeOperation({
      ...binding,
      result,
      activity: {
        id: `admin_status_${OPERATION_ID}`,
        userId: "user-1",
        type: "Admin",
        action: "suspend",
        actorId: "admin-1",
        status: "success",
        occurredAt: new Timestamp(101, 0),
        source: "trusted_function",
        transcript: "private",
      },
    }),
    "invalid-argument",
  );
});

test("completed operations fail safely when the event is missing or inconsistent", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  await manager.completeOperation({ ...binding, result, activity });
  db.records.delete(`adminActivityLogs/admin_status_${OPERATION_ID}`);
  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );

  db.records.set(`adminActivityLogs/admin_status_${OPERATION_ID}`, {
    ...activity,
    actorId: "different-admin",
  });
  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );
});

test("completed claims reject missing or malformed stored results", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  await manager.completeOperation({
    ...binding,
    result: {
      userId: "user-1",
      accountStatus: "suspended",
      updatedAt: "2026-10-29T12:00:00.000Z",
    },
    activity,
  });

  const operation = db.records.get(
    `adminAccountStatusOperations/${OPERATION_ID}`,
  );
  for (const invalidResult of [
    null,
    {
      userId: "different-user",
      accountStatus: "suspended",
      updatedAt: "2026-10-29T12:00:00.000Z",
    },
    {
      userId: "user-1",
      accountStatus: "active",
      updatedAt: "2026-10-29T12:00:00.000Z",
    },
    {
      userId: "user-1",
      accountStatus: "suspended",
      updatedAt: "not-a-timestamp",
    },
  ]) {
    operation.result = invalidResult;
    db.records.set(
      `adminAccountStatusOperations/${OPERATION_ID}`,
      operation,
    );

    await expectCode(manager.claimOperation(binding), "failed-precondition");
    assert.equal(
      db.records.get("adminAccountStatusLocks/user-1"),
      undefined,
    );
  }
});

test("completed completion retries reject an activity event with extra fields", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);
  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };
  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };
  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  await manager.claimOperation(binding);
  await manager.completeOperation({ ...binding, result, activity });
  db.records.set(`adminActivityLogs/admin_status_${OPERATION_ID}`, {
    ...activity,
    privateData: "unexpected",
  });

  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );
  assert.equal(
    db.records.get(`adminAccountStatusOperations/${OPERATION_ID}`).status,
    "completed",
  );
  assert.equal(db.records.has("adminAccountStatusLocks/user-1"), false);
});


test("completed completion retries reject a malformed stored result without changing existing records", async () => {
  const db = createFakeDb();
  const manager = managerFor(db);

  const binding = {
    operationId: OPERATION_ID,
    targetUserId: "user-1",
    requestedDisabled: true,
    actorId: "admin-1",
  };

  const result = {
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-10-29T12:00:00.000Z",
  };

  const activity = {
    id: `admin_status_${OPERATION_ID}`,
    userId: "user-1",
    type: "Admin",
    action: "suspend",
    actorId: "admin-1",
    status: "success",
    occurredAt: new Timestamp(101, 0),
    source: "trusted_function",
  };

  // Create a valid completed operation first.
  await manager.claimOperation(binding);
  await manager.completeOperation({ ...binding, result, activity });

  const operationPath =
    `adminAccountStatusOperations/${OPERATION_ID}`;
  const activityPath =
    `adminActivityLogs/admin_status_${OPERATION_ID}`;
  const lockPath = "adminAccountStatusLocks/user-1";

  // Corrupt the stored result to simulate inconsistent persisted data.
  const malformedResult = {
    ...result,
    userId: "different-user",
  };

  db.records.set(operationPath, {
    ...db.records.get(operationPath),
    result: malformedResult,
  });

  const operationBeforeRetry = {
    ...db.records.get(operationPath),
  };

  const activityBeforeRetry = db.records.get(activityPath);
  const lockBeforeRetry = db.records.get(lockPath);

  // A direct completion retry must reject the malformed stored result.
  await expectCode(
    manager.completeOperation({ ...binding, result, activity }),
    "failed-precondition",
  );

  // Existing records must not be modified by the failed retry.
  assert.deepEqual(db.records.get(operationPath), operationBeforeRetry);
  assert.deepEqual(db.records.get(activityPath), activityBeforeRetry);
  assert.deepEqual(db.records.get(lockPath), lockBeforeRetry);
});
