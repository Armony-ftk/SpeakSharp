const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createAccountStatusOperationStore,
  getStorageKey,
} = require("./accountStatusOperationStore");

const operationA = {
  operationId: "op_123e4567-e89b-42d3-a456-426614174000",
  userId: "user-a",
  requestedDisabled: true,
};

const operationB = {
  operationId: "op_123e4567-e89b-42d3-a456-426614174001",
  userId: "user-b",
  requestedDisabled: false,
};

const operationC = {
  operationId: "op_123e4567-e89b-42d3-a456-426614174002",
  userId: "user-a",
  requestedDisabled: false,
};

function createMemoryStorage() {
  const values = new Map();

  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

test("saves, loads, and clears only the allowed operation fields", async () => {
  const storage = createMemoryStorage();
  const store = createAccountStatusOperationStore({ storage });

  await store.save(operationA);
  assert.deepEqual(await store.load(operationA.userId), operationA);

  const raw = await storage.getItem(getStorageKey(operationA.userId));
  assert.deepEqual(Object.keys(JSON.parse(raw)).sort(), [
    "operationId",
    "requestedDisabled",
    "userId",
  ]);

  await store.clear(operationA.userId);
  assert.equal(await store.load(operationA.userId), null);
});

test("isolates attempts by target user", async () => {
  const storage = createMemoryStorage();
  const store = createAccountStatusOperationStore({ storage });

  await store.save(operationA);
  await store.save(operationB);

  assert.deepEqual(await store.load(operationA.userId), operationA);
  assert.deepEqual(await store.load(operationB.userId), operationB);
  assert.notEqual(getStorageKey(operationA.userId), getStorageKey(operationB.userId));
});

test("reuses an unresolved attempt after a new store instance is created", async () => {
  const storage = createMemoryStorage();
  const firstStore = createAccountStatusOperationStore({ storage });
  const remountedStore = createAccountStatusOperationStore({ storage });

  await firstStore.save(operationA);

  assert.deepEqual(await remountedStore.load(operationA.userId), operationA);
});

test("allows a distinct operation only after the previous attempt is cleared", async () => {
  const storage = createMemoryStorage();
  const store = createAccountStatusOperationStore({ storage });

  await store.save(operationA);
  await store.clear(operationA.userId);
  await store.save(operationC);

  assert.deepEqual(await store.load(operationC.userId), operationC);
  assert.notEqual(operationA.operationId, operationC.operationId);
});

test("rejects malformed stored records without silently replacing them", async () => {
  const storage = createMemoryStorage();
  const store = createAccountStatusOperationStore({ storage });
  const key = getStorageKey(operationA.userId);

  await storage.setItem(
    key,
    JSON.stringify({
      operationId: "not-an-operation-id",
      userId: operationA.userId,
      requestedDisabled: true,
    }),
  );

  await assert.rejects(
    store.load(operationA.userId),
    /stored account-status operation is invalid/i,
  );
  assert.equal((await storage.getItem(key)).includes("not-an-operation-id"), true);
});

test("propagates storage read failures", async () => {
  const store = createAccountStatusOperationStore({
    storage: {
      getItem: async () => {
        throw new Error("read failed");
      },
      setItem: async () => {},
      removeItem: async () => {},
    },
  });

  await assert.rejects(store.load(operationA.userId), /read failed/);
});

test("propagates storage write and clear failures", async () => {
  const store = createAccountStatusOperationStore({
    storage: {
      getItem: async () => null,
      setItem: async () => {
        throw new Error("write failed");
      },
      removeItem: async () => {
        throw new Error("clear failed");
      },
    },
  });

  await assert.rejects(store.save(operationA), /write failed/);
  await assert.rejects(store.clear(operationA.userId), /clear failed/);
});

test("rejects invalid attempts before storage writes", async () => {
  let writes = 0;
  const store = createAccountStatusOperationStore({
    storage: {
      getItem: async () => null,
      setItem: async () => {
        writes += 1;
      },
      removeItem: async () => {},
    },
  });

  await assert.rejects(
    store.save({ ...operationA, operationId: "op_not-a-v4-uuid" }),
    /invalid/i,
  );
  await assert.rejects(
    store.save({ ...operationA, requestedDisabled: "true" }),
    /invalid/i,
  );
  assert.equal(writes, 0);
});
