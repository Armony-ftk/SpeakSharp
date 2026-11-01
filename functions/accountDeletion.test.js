const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createAccountDeletion } = require("./accountDeletion");

function fixture() {
  const docs = new Map([
    ["users/alice", { fullName: "Alice" }],
    ["users/alice/sessions/s", { title: "Talk" }],
    ["users/alice/sessions/s/recordings/r", { audioPath: "recordings/alice/s/r.m4a" }],
    ["users/alice/sessions/s/recordings/r/private/nested", { value: 1 }],
    ["users/bob", { fullName: "Bob" }],
    ["adminActivityLogs/event", { userId: "alice", userName: "Alice", type: "session_created" }],
    ["adminAccountStatusOperations/history", { userId: "alice" }],
  ]);
  const users = new Map([["alice", {}], ["bob", {}]]);
  const files = new Set(["recordings/alice/s/r.m4a", "recordings/alice/orphan/file.m4a",
    "users/alice/sessions/old/recordings/legacy.m4a", "recordings/alice2/keep.m4a", "recordings/bob/keep.m4a"]);
  const state = { events: [], storageFailure: false, firestoreFailure: false, authFailure: false, clock: 1000000 };
  const snapshot = (path) => ({ id: path.split("/").at(-1), ref: reference(path), exists: docs.has(path), data: () => docs.get(path) });
  const query = (path, after, size = 200, condition) => ({
    orderBy() { return this; }, limit(n) { return query(path, after, n, condition); },
    startAfter(doc) { return query(path, doc.id, size, condition); },
    where(field, op, value) { return query(path, after, size, [field, op, value]); },
    async get() {
      const result = [...docs.keys()].filter((key) => key.startsWith(`${path}/`) && key.split("/").length === path.split("/").length + 1)
        .sort().filter((key) => !after || key.split("/").at(-1) > after)
        .filter((key) => !condition || docs.get(key)[condition[0]]?.includes(condition[2])).slice(0, size).map(snapshot);
      return { docs: result, empty: !result.length };
    },
  });
  function reference(path) {
    return { path, id: path.split("/").at(-1), get: async () => snapshot(path), collection: (name) => query(`${path}/${name}`),
      update: async (updates) => { assert.ok(docs.has(path)); docs.set(path, { ...docs.get(path), ...updates }); },
      listCollections: async () => [...docs.keys()].some((key) => key.startsWith(`${path}/`)) ? [{}] : [] };
  }
  let transactions = Promise.resolve();
  const db = { doc: reference, collection: (name) => query(name),
    runTransaction(action) {
      const task = transactions.then(async () => {
        const writes = [];
        const result = await action({ get: async (ref) => snapshot(ref.path),
          set: (ref, data) => writes.push(() => docs.set(ref.path, data)),
          update: (ref, data) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...data })) });
        writes.forEach((write) => write()); return result;
      }); transactions = task.catch(() => {}); return task;
    },
    batch: () => { const writes = []; return { update: (ref, updates) => writes.push([ref, updates]),
      commit: async () => { for (const [ref, updates] of writes) await ref.update(updates); } }; },
    recursiveDelete: async (ref) => {
      state.events.push("firestore");
      for (const key of [...docs.keys()]) if (key === ref.path || key.startsWith(`${ref.path}/`)) docs.delete(key);
      if (state.firestoreFailure) throw new Error("Firestore unavailable");
    },
  };
  const auth = { getUser: async (uid) => {
    if (!users.has(uid)) throw Object.assign(new Error("missing"), { code: "auth/user-not-found" }); return users.get(uid);
  }, deleteUser: async (uid) => {
    state.events.push("auth");
    if (state.authFailure) throw new Error("Auth unavailable");
    users.delete(uid);
  } };
  const bucket = { getFiles: async ({ prefix, maxResults, pageToken }) => {
    assert.equal(maxResults, 200);
    await state.storageGate;
    if (state.storageFailure) throw new Error("Storage unavailable");
    const matches = [...files].filter((name) => name.startsWith(prefix) && (!pageToken || name > pageToken)).sort();
    const page = matches.slice(0, maxResults);
    return [page.map((name) => ({ name, delete: async ({ ignoreNotFound }) => {
      assert.equal(ignoreNotFound, true);
      if (state.deleteFailure) throw new Error("Object deletion denied");
      state.events.push("storage"); files.delete(name);
    } })), matches.length > maxResults ? { pageToken: page.at(-1) } : null];
  } };
  const handler = createAccountDeletion({ db, auth, bucket, logger: { error() {} }, now: () => state.clock });
  const request = { auth: { uid: "alice", token: { auth_time: state.clock / 1000 } }, data: { receipt: "ab".repeat(32) } };
  return { docs, files, users, state, request, handler, run: (value = request) => handler(value) };
}

test("rejects unauthenticated, missing/future/stale auth_time before any deletion", async () => {
  for (const auth of [null, { uid: "alice", token: {} }, { uid: "alice", token: { auth_time: 600 } }, { uid: "alice", token: { auth_time: 2000 } }]) {
    const f = fixture(); await assert.rejects(f.run({ ...f.request, auth }), (e) => ["unauthenticated", "failed-precondition"].includes(e.code));
    assert.equal(f.state.events.length, 0); assert.equal(f.docs.has("accountDeletions/alice"), false);
  }
});
test("only deletes request.auth.uid, ignoring supplied owner, path and email", async () => {
  const f = fixture(); f.request.data = { ...f.request.data, uid: "bob", email: "bob@test", path: "users/bob" };
  const history = structuredClone(f.docs.get("adminActivityLogs/event"));
  assert.deepEqual(await f.run(), { success: true });
  assert.equal([...f.docs.keys()].some((key) => key === "users/alice" || key.startsWith("users/alice/")), false);
  assert.ok(f.docs.has("users/bob")); assert.ok(f.users.has("bob")); assert.ok(!f.users.has("alice"));
  assert.deepEqual(f.docs.get("adminActivityLogs/event"), history);
  assert.ok(f.docs.has("adminAccountStatusOperations/history"));
  assert.deepEqual([...f.files].sort(), ["recordings/alice2/keep.m4a", "recordings/bob/keep.m4a"]);
  assert.equal(f.state.events.at(-1), "auth");
});
test("rejects admin and suspended accounts including current claims differing from token", async () => {
  for (const mode of ["token", "claims", "suspended", "profile"]) {
    const f = fixture();
    if (mode === "token") f.request.auth.token.admin = true;
    if (mode === "claims") f.users.set("alice", { customClaims: { admin: true } });
    if (mode === "suspended") f.users.set("alice", { disabled: true });
    if (mode === "profile") f.docs.get("users/alice").disabled = true;
    await assert.rejects(f.run(), { code: "permission-denied" }); assert.equal(f.state.events.length, 0);
  }
});
for (const stage of ["storageFailure", "deleteFailure", "firestoreFailure", "authFailure"]) {
  test(`${stage} never reports success and safely retries even after profile removal`, async () => {
    const f = fixture(); f.state[stage] = true;
    await assert.rejects(f.run(), { code: "unavailable" });
    assert.ok(f.users.has("alice")); assert.ok(f.docs.has("accountDeletions/alice"));
    assert.equal(f.docs.get("accountDeletions/alice").leaseUntil, 0);
    if (stage !== "authFailure") assert.ok(!f.state.events.includes("auth"));
    f.state[stage] = false;
    assert.deepEqual(await f.run(), { success: true });
    assert.deepEqual(await f.run(), { success: true });
  });
}
test("paginated storage sweep deletes orphan audio without touching prefix neighbours", async () => {
  const f = fixture(); for (let i = 0; i < 425; i++) f.files.add(`recordings/alice/orphan/${String(i).padStart(4, "0")}.m4a`);
  await f.run(); assert.equal(f.files.size, 2);
});
test("concurrent deletion has one lease and cannot double-delete Auth", async () => {
  const f = fixture(); let release;
  f.state.storageGate = new Promise((resolve) => { release = resolve; });
  const first = f.run(); await new Promise(setImmediate);
  await assert.rejects(f.run(), { code: "aborted" });
  release(); await first;
  assert.equal(f.state.events.filter((event) => event === "auth").length, 1);
});
test("expired crash lease can recover; a live lease cannot be stolen", async () => {
  const f = fixture(); f.docs.set("accountDeletions/alice", { phase: "pending", leaseUntil: f.state.clock + 5000 });
  await assert.rejects(f.run(), { code: "aborted" });
  f.state.clock += 6000; f.request.auth.token.auth_time = f.state.clock / 1000;
  await f.run(); assert.ok(!f.users.has("alice"));
});
test("completion capability only reveals confirmed cleanup plus missing Auth; it cannot delete", async () => {
  const f = fixture();
  const confirm = (receipt = f.request.data.receipt) => f.run({ data: { confirmOnly: true, receipt } });
  assert.deepEqual(await confirm(), { success: false }); assert.equal(f.state.events.length, 0);
  f.state.authFailure = true; await assert.rejects(f.run());
  assert.deepEqual(await confirm(), { success: false });
  f.state.authFailure = false; await f.run();
  assert.deepEqual(await confirm(), { success: true });
  assert.deepEqual(await confirm("ff".repeat(32)), { success: false });
  await assert.rejects(confirm("bad"), { code: "unauthenticated" });
});
