const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { transformFileSync } = require("@babel/core");

function load(relative, imports = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const { code } = transformFileSync(filename, { babelrc: false, configFile: false,
    plugins: [[require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
      require.resolve("@babel/plugin-transform-modules-commonjs")] });
  const exports = {};
  vm.runInNewContext(code, { exports, Date, Map, Set, Promise, Object, __DEV__: false,
    setTimeout, clearTimeout, require(name) {
      assert.ok(name in imports, `Unexpected import in ${relative}: ${name}`);
      return imports[name];
    } }, { filename });
  return exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));
const error = (code) => Object.assign(new Error(code), { code });
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }

function fixture(disk = { metadata: new Map(), files: new Map() }) {
  let failWrite = null, failCopy = false;
  const writes = [];
  const storage = {
    getAllKeys: async () => [...disk.metadata.keys()],
    getItem: async (key) => disk.metadata.get(key) ?? null,
    setItem: async (key, value) => {
      if (failWrite?.(key, value)) throw error("device/disk-full");
      writes.push([key, value]); disk.metadata.set(key, value);
    },
    removeItem: async (key) => { disk.metadata.delete(key); },
  };
  class Directory {
    constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join("/"); }
    create() {}
  }
  class File extends Directory {
    get exists() { return disk.files.has(this.uri); }
    info() { return { exists: this.exists, size: disk.files.get(this.uri)?.length ?? 0 }; }
    async copy(destination) { if (failCopy) throw error("device/copy-failed"); disk.files.set(destination.uri, disk.files.get(this.uri)); }
    delete() { disk.files.delete(this.uri); }
  }
  const audio = load("storage/audioStorage.js", {
    "@react-native-async-storage/async-storage": { default: storage, __esModule: true },
    "expo-file-system": { File, Directory, Paths: { document: "file:///documents", cache: "file:///cache" } },
  });
  const queue = load("storage/recordingQueue.js", {
    "@react-native-async-storage/async-storage": { default: storage, __esModule: true },
    "./audioStorage": audio, "../constants/recording": { MAX_RECORDING_SECONDS: 900 },
  });
  const source = (id) => { const uri = `file:///cache/${id}.m4a`; disk.files.set(uri, "original-audio"); return uri; };
  const save = (id = "r1", uid = "alice", sessionId = "session") => queue.saveQueuedRecording({
    userId: uid, sessionId, recordingId: id, sourceUri: source(id), durationSeconds: 42,
    session: { title: "My presentation", status: "active", targetDurationSeconds: 60 },
  });
  return { disk, queue, audio, save, source, storage, writes,
    failWrite: (predicate) => { failWrite = predicate; }, failCopy: (value) => { failCopy = value; } };
}

function workerFixture(f, queueList) {
  const { createRecordingSyncWorker } = load("utils/recordingSyncWorker.js");
  let uid = "alice", online = true, clock = 100000, uploadFailure, session = {}, readFailure, gate;
  const documents = new Map(), objects = new Map(), calls = [];
  const worker = createRecordingSyncWorker({ owner: () => uid, online: () => online, now: () => clock,
    queue: { list: queueList ?? f.queue.getQueuedRecordings,
      update: (entry, updates) => f.queue.updateQueuedRecording(entry.userId, entry.recordingId, updates),
      hasAudio: (entry) => f.audio.hasLocalAudio(entry.localUri) },
    remote: {
      session: async (entry) => { calls.push(["session", entry.recordingId]); if (readFailure) throw readFailure; return session; },
      recording: async (entry) => documents.get(entry.recordingId) ?? null,
      object: async (entry) => objects.get(entry.recordingId) ?? null,
      create: async (entry) => {
        calls.push(["create", entry.recordingId]);
        const doc = { processingStatus: "pending_upload", durationSeconds: entry.durationSeconds };
        documents.set(entry.recordingId, doc); return doc;
      },
      receipt: async (entry) => { calls.push(["receipt", entry.recordingId]); documents.get(entry.recordingId).uploadedAt = 1; },
    },
    upload: async (entry) => {
      calls.push(["upload", entry.recordingId]);
      await gate?.promise;
      if (uploadFailure) throw uploadFailure;
      objects.set(entry.recordingId, { generation: `generation-${calls.length}` });
    },
  });
  return { worker, documents, objects, calls,
    uid: (value) => { uid = value; }, online: (value) => { online = value; },
    advance: (value) => { clock += value; }, failUpload: (value) => { uploadFailure = value; },
    failRead: (value) => { readFailure = value; }, session: (value) => { session = value; },
    gate: () => (gate = deferred()), uploads: () => calls.filter(([name]) => name === "upload").length };
}

test("offline save stores only metadata in AsyncStorage and real audio in documents; restart restores three attempts", async () => {
  const f = fixture();
  await Promise.all([f.save("r1"), f.save("r2"), f.save("r3")]);
  const entries = f.queue.getQueuedRecordings("alice");
  assert.equal(entries.length, 3);
  for (const entry of entries) {
    assert.match(entry.localUri, /^file:\/\/\/documents\/SpeakSharp\/recordings\//);
    assert.equal(f.disk.files.get(entry.localUri), "original-audio");
    assert.equal(entry.syncStatus, "queued"); assert.equal(entry.durationSeconds, 42);
  }
  for (const [key, raw] of f.disk.metadata) {
    if (key.includes("recording-queue")) { assert.ok(!raw.includes("original-audio")); assert.ok(!raw.includes("base64")); }
  }
  const restarted = fixture(f.disk);
  await restarted.queue.restoreRecordingQueue("alice");
  const merged = restarted.queue.mergeSessionEntries([], restarted.queue.getQueuedRecordings("alice"));
  assert.equal(merged[0].data.title, "My presentation");
  assert.equal(merged[0].recordings.length, 3);
  assert.ok(merged[0].recordings.every((entry) => entry.processingStatus === "pending_upload"));
});

test("repeated/concurrent saves retain one stable ID and concurrent mappings retain every audio file", async () => {
  const f = fixture();
  await Promise.all([f.save(), f.save(), f.save(), f.save("r2"), f.save("r3")]);
  assert.equal(f.queue.getQueuedRecordings("alice").length, 3);
  assert.equal(f.writes.filter(([key, raw]) => key.includes("recording-queue") && JSON.parse(raw).syncStatus === "queued").length, 3);
  for (const id of ["r1", "r2", "r3"]) assert.ok(await f.audio.getLocalRecordingUri(id));
});

test("a crash between persistent file copy and metadata commit recovers the same audio and ID", async () => {
  const f = fixture();
  f.failWrite((key, raw) => key.includes("recording-queue") && JSON.parse(raw).syncStatus === "queued");
  await assert.rejects(f.save());
  assert.ok(f.disk.files.has(f.audio.persistentRecordingUri("r1")));
  f.disk.files.delete("file:///cache/r1.m4a");
  const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
  assert.equal(restarted.queue.getQueuedRecordings("alice")[0].recordingId, "r1");
  assert.equal(restarted.queue.getQueuedRecordings("alice")[0].syncStatus, "queued");
});

test("crash before file copy replays the durable save journal; map-write failure keeps persistent audio", async () => {
  const f = fixture(); f.failCopy(true); await assert.rejects(f.save());
  const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
  assert.equal(restarted.queue.getQueuedRecordings("alice").length, 1);
  const g = fixture(); g.failWrite((key) => key.includes("local-recordings"));
  await assert.rejects(g.save()); assert.ok(g.disk.files.has(g.audio.persistentRecordingUri("r1")));
  const again = fixture(g.disk); await again.queue.restoreRecordingQueue("alice");
  assert.ok(await again.audio.getLocalRecordingUri("r1"));
});

test("copy/storage failures never acknowledge save; recovery exposes missing source safely", async () => {
  const f = fixture(); f.failWrite(() => true);
  await assert.rejects(f.save()); assert.equal(f.queue.getQueuedRecordings("alice").length, 0);
  assert.equal(f.disk.files.get("file:///cache/r1.m4a"), "original-audio");
  const g = fixture(); g.failCopy(true); await assert.rejects(g.save());
  g.disk.files.clear(); const restarted = fixture(g.disk); await restarted.queue.restoreRecordingQueue("alice");
  const entry = restarted.queue.getQueuedRecordings("alice")[0];
  assert.equal(entry.syncStatus, "error"); assert.equal(entry.blocked, true);
});

test("accounts restore and display only their own queue; sign-out retains files and metadata", async () => {
  const f = fixture(); await f.save("a", "alice"); await f.save("b", "bob");
  assert.deepEqual(plain(f.queue.getQueuedRecordings("alice").map((entry) => entry.recordingId)), ["a"]);
  const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("bob");
  assert.equal(restarted.queue.getQueuedRecordings("alice").length, 0);
  assert.equal(restarted.queue.getQueuedRecordings("bob").length, 1);
  await restarted.queue.restoreRecordingQueue("alice");
  assert.equal(restarted.queue.getQueuedRecordings("alice").length, 1);
  assert.equal(restarted.queue.getQueuedRecordings(null).length, 0);
});

test("online save and offline/reconnect use one upload per stable recording", async () => {
  const f = fixture(); const w = workerFixture(f); w.online(false);
  await f.save(); await w.worker.wake(); assert.equal(w.uploads(), 0);
  w.online(true); await w.worker.wake(); assert.equal(w.uploads(), 1);
  await f.save("r2"); await w.worker.wake(); assert.equal(w.uploads(), 2);
  assert.equal(w.documents.size, 2);
  assert.ok(f.queue.getQueuedRecordings("alice").every((entry) => entry.syncStatus === "synced"));
  await w.worker.wake(); assert.equal(w.uploads(), 2);
});

test("startup/foreground/connectivity/save triggers stay single-flight including a save during upload", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f); const gate = w.gate();
  const first = w.worker.wake(); await new Promise(setImmediate);
  await f.save("r2"); const second = w.worker.wake(); const third = w.worker.wake();
  assert.equal(w.uploads(), 1); assert.equal(first, second); assert.equal(second, third);
  gate.resolve(); await first;
  assert.equal(w.uploads(), 2); assert.equal(w.documents.size, 2);
});

test("a save trigger arriving while the previous flight is releasing is not lost", async () => {
  const f = fixture(); await f.save(); let firstSnapshot = true, w;
  w = workerFixture(f, (uid) => {
    if (firstSnapshot) {
      firstSnapshot = false;
      Promise.resolve().then(() => w.worker.wake());
      return [];
    }
    return f.queue.getQueuedRecordings(uid);
  });
  await w.worker.wake(); assert.equal(w.uploads(), 1);
});

test("network upload failure is retained with backoff then retries without recreating the document", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f);
  w.failUpload(error("storage/retry-limit-exceeded")); await w.worker.wake();
  assert.equal(f.queue.getQueuedRecordings("alice")[0].syncStatus, "queued");
  assert.ok(f.disk.files.has(f.audio.persistentRecordingUri("r1")));
  await w.worker.wake(); assert.equal(w.uploads(), 1);
  w.advance(6000); w.failUpload(null); await w.worker.wake();
  assert.equal(w.uploads(), 2); assert.equal(w.calls.filter(([name]) => name === "create").length, 1);
});

test("restart after document creation/during upload reuses document and recovers safely", async () => {
  const f = fixture(); await f.save(); await f.queue.updateQueuedRecording("alice", "r1", { syncStatus: "uploading" });
  const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
  const w = workerFixture(restarted); w.documents.set("r1", { processingStatus: "pending_upload" });
  await w.worker.wake(); assert.equal(w.uploads(), 1);
  assert.equal(w.calls.filter(([name]) => name === "create").length, 0);
});

test("remote uploaded/processing/completed/transcription-failed attempts are never automatically uploaded again", async () => {
  for (const remote of [{ processingStatus: "pending_upload", uploadedAt: 1 },
    ...["transcribing", "transcript_ready", "analysing", "completed", "failed"].map((processingStatus) => ({ processingStatus }))]) {
    const f = fixture(); await f.save(); const w = workerFixture(f); w.documents.set("r1", remote);
    await w.worker.wake(); assert.equal(w.uploads(), 0, remote.processingStatus);
    assert.equal(f.queue.getQueuedRecordings("alice")[0].syncStatus, "synced");
    assert.equal(w.documents.get("r1").processingStatus, remote.processingStatus);
  }
});

test("upload success before local checkpoint or backend claim is reconciled from Storage", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f);
  w.documents.set("r1", { processingStatus: "pending_upload" }); w.objects.set("r1", { generation: "existing" });
  await w.worker.wake(); assert.equal(w.uploads(), 0);
  assert.equal(w.documents.get("r1").uploadedAt, 1);
});

test("a cold-start synchronized handoff rechecks remote deletion without recreating the recording", async () => {
  for (const deletedParent of [false, true]) {
    const f = fixture(); await f.save(); const w = workerFixture(f); await w.worker.wake();
    const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
    const next = workerFixture(restarted);
    if (deletedParent) next.session(null);
    await next.worker.wake();
    assert.equal(next.uploads(), 0); assert.equal(next.documents.size, 0);
    assert.equal(restarted.queue.getQueuedRecordings("alice")[0].blocked, true);
  }
});

test("explicit failed transcription retry is permitted once and interrupted retry uses generation checkpoint", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f);
  w.documents.set("r1", { processingStatus: "failed", uploadedAt: 1, processingError: { stage: "transcription" } });
  w.objects.set("r1", { generation: "old" });
  await f.queue.updateQueuedRecording("alice", "r1", { retryProcessing: true });
  await w.worker.wake(); assert.equal(w.uploads(), 1);
  const g = fixture(); await g.save(); const recovered = workerFixture(g);
  recovered.documents.set("r1", { processingStatus: "failed", uploadedAt: 1 });
  recovered.objects.set("r1", { generation: "new" });
  await g.queue.updateQueuedRecording("alice", "r1", { retryProcessing: true, uploadAttemptStarted: true, generationBefore: "old" });
  await recovered.worker.wake(); assert.equal(recovered.uploads(), 0);
});

test("permissions block automatic retries; missing/deleting sessions are never recreated", async () => {
  for (const reason of ["permission", "missing", "deleting"]) {
    const f = fixture(); await f.save(); const w = workerFixture(f);
    if (reason === "permission") w.failRead(error("permission-denied"));
    else w.session(reason === "missing" ? null : { deleting: true });
    await w.worker.wake(); await w.worker.wake();
    assert.equal(w.uploads(), 0); assert.equal(w.documents.size, 0);
    assert.equal(f.queue.getQueuedRecordings("alice")[0].blocked, true);
    assert.equal(w.calls.filter(([name]) => name === "session").length, 1);
  }
});

test("missing local audio blocks upload and never reports uploaded or removes metadata", async () => {
  const f = fixture(); await f.save(); f.disk.files.clear(); const w = workerFixture(f);
  await w.worker.wake(); const entry = f.queue.getQueuedRecordings("alice")[0];
  assert.equal(entry.syncStatus, "error"); assert.equal(entry.blocked, true);
  assert.equal(w.uploads(), 0); assert.equal(w.documents.size, 0);
});

test("account switch during network read cannot create or upload under another owner", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f);
  const pending = w.worker.wake(); w.uid("bob"); await pending;
  assert.equal(w.uploads(), 0); assert.equal(w.documents.size, 0);
  w.uid("alice"); w.advance(6000); await w.worker.wake(); assert.equal(w.uploads(), 1);
});

test("durable handoff merges one ID through completion and acknowledgement without UI gaps", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f); await w.worker.wake();
  const remote = [{ id: "r1", sessionId: "session", processingStatus: "analysing", createdAt: new Date() }];
  assert.equal(f.queue.mergeRecordings([], f.queue.getQueuedRecordings("alice")).length, 1);
  const during = f.queue.mergeRecordings(remote, f.queue.getQueuedRecordings("alice"));
  assert.equal(during.length, 1); assert.equal(during[0].processingStatus, "analysing");
  await f.queue.removeQueuedRecording("alice", "r1");
  assert.equal(f.queue.mergeRecordings(remote, f.queue.getQueuedRecordings("alice")).length, 1);
  assert.ok(f.disk.files.has(f.audio.persistentRecordingUri("r1")));
});

test("pending recordings change only attempt totals; four-record 2-versus-2 comparisons stay unchanged", async () => {
  const stats = load("utils/progressStats.js", { "../constants/recordindStatuses.js": { RECORDING_STATUS: { COMPLETED: "completed" } } });
  const rated = [6, 7, 8, 9].map((rating, index) => ({ id: `done-${index}`, sessionId: "session",
    processingStatus: "completed", createdAt: new Date(1000 + index * 1000), aiFeedback: { overallRating: rating },
    metrics: { fillerCount: index, wordsPerMinute: 100 + index } }));
  const f = fixture(); await f.save(); const local = f.queue.mergeRecordings(rated, f.queue.getQueuedRecordings("alice"));
  const before = stats.calculateProgress(1, rated), after = stats.calculateProgress(1, local);
  assert.equal(after.overview.attempts, 5); assert.equal(after.overview.average, before.overview.average);
  assert.equal(after.overview.best, before.overview.best); assert.equal(after.eligibleCount, 4);
  assert.deepEqual(plain(after.comparison), plain(before.comparison));
  assert.equal(stats.getSessionSummaries([{ data: { id: "session" }, recordings: local }])[0].latestRating, 9);
});

test("local deletion pause prevents a queued upload from starting", async () => {
  const f = fixture(); await f.save(); const w = workerFixture(f);
  await f.queue.updateQueuedRecording("alice", "r1", { deletionPending: true });
  await w.worker.wake(); assert.equal(w.uploads(), 0);
  await f.queue.removeQueuedRecording("alice", "r1"); await w.worker.wake(); assert.equal(w.uploads(), 0);
});

test("a stale synced acknowledgement cannot remove a new retry or an unfinished deletion", async () => {
  const f = fixture(); await f.save();
  await f.queue.removeQueuedRecording("alice", "r1", { onlySynced: true });
  assert.equal(f.queue.getQueuedRecordings("alice").length, 1);
  await f.queue.updateQueuedRecording("alice", "r1", { syncStatus: "synced", retryProcessing: true });
  await f.queue.removeQueuedRecording("alice", "r1", { onlySynced: true });
  assert.equal(f.queue.getQueuedRecordings("alice").length, 1);
  await f.queue.updateQueuedRecording("alice", "r1", { retryProcessing: false, deletionPending: true });
  await f.queue.removeQueuedRecording("alice", "r1", { onlySynced: true });
  assert.equal(f.queue.getQueuedRecordings("alice").length, 1);
  const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
  assert.equal(restarted.queue.getQueuedRecordings("alice")[0].deletionPending, true);
});

test("partial file copies are recovered using the journal byte length", async () => {
  const f = fixture(); f.failCopy(true); await assert.rejects(f.save());
  f.disk.files.set(f.audio.persistentRecordingUri("r1"), "partial");
  const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
  assert.equal(restarted.disk.files.get(restarted.audio.persistentRecordingUri("r1")), "original-audio");
});

function hookRuntime() {
  const hooks = []; let cursor = 0; const effects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => value === b[index]);
  const react = {
    useState(value) { const index = cursor++; if (!(index in hooks)) hooks[index] = value;
      return [hooks[index], (next) => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }]; },
    useRef(value) { const index = cursor++; return hooks[index] ??= { current: value }; },
    useCallback(fn, deps) { const index = cursor++; if (!same(hooks[index]?.deps, deps)) hooks[index] = { deps, fn }; return hooks[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!same(hooks[index]?.deps, deps)) {
      const previous = hooks[index]; hooks[index] = { deps };
      effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = fn(); });
    } },
  };
  return { react, render(fn) { cursor = 0; const value = fn(); while (effects.length) effects.shift()(); return value; },
    unmount() { hooks.forEach((hook) => hook?.cleanup?.()); } };
}

test("the real queue lifecycle restores at startup, wakes on reconnect/foreground/save and masks account data", async () => {
  const runtime = hookRuntime(); const events = {}; const calls = []; let uid = "alice";
  let net = { isConnected: false, isInternetReachable: false };
  const AppState = { currentState: "active", addEventListener: (_, listener) => {
    events.foreground = listener; return { remove: () => calls.push("removeAppState") };
  } };
  const hook = load("hooks/useRecordingQueue.js", {
    react: runtime.react, "react-native": { AppState },
    "@react-native-community/netinfo": { default: {
      addEventListener: (listener) => { events.network = listener; listener(net); return () => calls.push("removeNetwork"); },
      fetch: async () => net,
    }, __esModule: true },
    "../storage/recordingQueue": {
      getQueuedRecordings: (owner) => [{ userId: owner, recordingId: owner }],
      subscribeRecordingQueue: (listener) => { events.save = listener; return () => calls.push("removeQueue"); },
    },
    "../services/recordingSyncService": {
      recordingSync: { wake: async () => { calls.push("wake"); } },
      restoreRecordingQueue: async (owner) => { calls.push(["restore", owner]); },
      setRecordingSyncConnection: (...args) => calls.push(["connection", ...args]),
    },
  });
  const render = () => runtime.render(() => hook.useRecordingQueue(uid));
  render(); await new Promise(setImmediate); let state = render();
  assert.equal(state.entries[0].userId, "alice"); assert.equal(state.online, false);
  net = { isConnected: true, isInternetReachable: true }; events.network(net); render();
  events.save(); AppState.currentState = "background"; events.foreground("background");
  AppState.currentState = "active"; events.foreground("active"); await new Promise(setImmediate);
  assert.ok(calls.filter((call) => call === "wake").length >= 3);
  assert.deepEqual(calls.find((call) => Array.isArray(call) && call[0] === "restore"), ["restore", "alice"]);
  uid = "bob"; assert.equal(render().entries.length, 0);
  await new Promise(setImmediate); assert.equal(render().entries[0].userId, "bob");
  runtime.unmount(); assert.ok(calls.includes("removeNetwork")); assert.ok(calls.includes("removeQueue"));
});

test("Use This Recording waits for durable local save, rejects repeated taps, and survives unmount during save", async () => {
  for (const [unmount, failSave] of [[false, false], [true, false], [false, true]]) {
    const f = fixture(), runtime = hookRuntime(), gate = deferred(), calls = [];
    if (failSave) f.failWrite((key, value) => key.includes("recording-queue") && JSON.parse(value).syncStatus === "queued");
    const recording = { phase: "stopped", recordingUri: f.source("r1"), durationSeconds: 42, durationMillis: 42000,
      protectDuringSave: () => calls.push("protect"), releaseFailedSave: () => calls.push("release"),
      markAccepted: () => calls.push("accepted"), clearError() {} };
    const jsx = (type, props) => ({ type, props });
    const imports = {
      react: runtime.react, "react/jsx-runtime": { jsx, jsxs: jsx },
      "react-native": { StyleSheet: { create: (value) => value },
        Animated: { Value: class { setValue() {} } }, Easing: {}, Text: "Text", View: "View", TouchableOpacity: "Touch" },
      "expo-router": { useLocalSearchParams: () => ({ id: "session" }), router: { replace: (route) => calls.push(["navigate", route]) } },
      "@expo/vector-icons": { Ionicons: "Icon" },
      "expo-audio": { useAudioPlayer: () => ({}), useAudioPlayerStatus: () => ({}) },
      "../../constants/theme": { spacing: {}, radius: {} },
      "../../constants/ThemeContext": { useAppTheme: () => ({ colors: {}, typography: {} }) },
      "../../services/sessionService": { getSessionById: async () => ({ id: "session", title: "Presentation" }) },
      "../../services/recordingService": { createRecordingId: () => "r1", getRecordingErrorMessage: () => "Save failed" },
      "../../hooks/useRecording": { useRecording: () => recording, MAX_RECORDING_SECONDS: 900 },
      "../../storage/audioStorage": { ...f.audio, deleteTemporaryAudio: async () => calls.push("removeTemp") },
      "../../storage/recordingQueue": { ...f.queue, saveQueuedRecording: async (entry) => { await gate.promise; return f.queue.saveQueuedRecording(entry); } },
      "../../context/AccountDataContext": { useAccountData: () => ({ uid: "alice", sessions: [{ id: "session", title: "Presentation" }], recordingEntries: [] }) },
    };
    for (const name of ["ScreenContainer", "PrimaryButton", "Waveform", "ConfirmDialog"]) imports[`../ui/${name}`] = { default: name, __esModule: true };
    const Screen = load("components/screens/LocalRecordingScreen.js", imports).default;
    const tree = runtime.render(Screen);
    const all = (node) => Array.isArray(node) ? node.flatMap(all) : node && typeof node === "object" ? [node, ...all(node.props?.children)] : [];
    const button = all(tree).find((node) => node.props?.label === "USE THIS RECORDING");
    assert.ok(button);
    const saving = button.props.onPress(); await button.props.onPress();
    assert.deepEqual(calls, ["protect"]);
    if (unmount) runtime.unmount();
    gate.resolve(); await saving;
    assert.equal(f.queue.getQueuedRecordings("alice").length, failSave ? 0 : 1);
    assert.equal(calls.includes("accepted"), !failSave);
    assert.equal(calls.includes("release"), failSave);
    assert.equal(calls.filter((call) => Array.isArray(call) && call[0] === "navigate").length, unmount || failSave ? 0 : 1);
    if (failSave) {
      assert.ok(f.disk.files.has(f.audio.persistentRecordingUri("r1")));
      const restarted = fixture(f.disk); await restarted.queue.restoreRecordingQueue("alice");
      assert.equal(restarted.queue.getQueuedRecordings("alice").length, 1);
    }
    if (!unmount) runtime.unmount();
  }
});

test("recorder start/pause/resume/stop keeps original format and 900-second hard limit; saving protects unmount cleanup", async () => {
  const runtime = hookRuntime(), calls = [], removed = [];
  const status = { durationMillis: 0, isRecording: false, canRecord: true, url: "file:///cache/voice.m4a" };
  let options;
  const recorder = { uri: status.url,
    prepareToRecordAsync: async () => calls.push("prepare"),
    record: () => { status.isRecording = true; calls.push("record"); },
    pause: () => { status.isRecording = false; calls.push("pause"); },
    stop: async () => { status.isRecording = false; calls.push("stop"); },
    getStatus: () => ({ ...status }),
  };
  const module = load("hooks/useRecording.js", {
    react: runtime.react, "react-native": { Platform: { OS: "ios" } },
    "expo-audio": { AudioQuality: { MEDIUM: "medium" }, RecordingPresets: { HIGH_QUALITY: {
      extension: ".m4a", ios: { outputFormat: "aac" }, web: {} } },
      getRecordingPermissionsAsync: async () => ({ granted: true }), setAudioModeAsync: async () => {},
      useAudioRecorder: (value) => { options = value; return recorder; }, useAudioRecorderState: () => status },
    "../storage/audioStorage": { deleteTemporaryAudio: async (uri) => removed.push(uri) },
    "../constants/recording": { MAX_RECORDING_SECONDS: 900 },
  });
  const render = () => runtime.render(() => module.useRecording());
  let hook = render(); assert.equal(await hook.startRecording(), true);
  hook = render(); assert.equal(hook.phase, "recording"); status.durationMillis = 4000;
  assert.equal(await hook.pauseRecording(), true); hook = render(); assert.equal(hook.phase, "paused");
  assert.equal(await hook.resumeRecording(), true); hook = render(); assert.equal(hook.phase, "recording");
  status.durationMillis = 900000; render(); await new Promise(setImmediate); hook = render();
  assert.equal(hook.phase, "stopped"); assert.equal(hook.durationSeconds, 900); assert.equal(hook.stoppedAtLimit, true);
  assert.equal(options.extension, ".m4a"); assert.equal(options.numberOfChannels, 1); assert.equal(options.bitRate, 64000);
  assert.equal(options.directory, "cache"); assert.equal(options.ios.outputFormat, "aac");
  assert.deepEqual(calls, ["prepare", "record", "pause", "record", "stop"]);
  hook.protectDuringSave(); runtime.unmount(); await new Promise(setImmediate);
  assert.equal(removed.length, 0);
});

function serviceFixture(f) {
  const documents = new Map(), objects = new Map(), calls = [], writes = [];
  const auth = { currentUser: { uid: "alice" } }; let denied = false;
  const pathOf = (first, ...parts) => ({ path: [first.path, ...parts].filter(Boolean).join("/") });
  const snapshot = (reference) => ({ id: reference.path.split("/").at(-1),
    exists: () => documents.has(reference.path), data: () => documents.get(reference.path) });
  const server = { marker: "serverTimestamp" };
  const worker = load("utils/recordingSyncWorker.js");
  const constants = load("constants/recording.js");
  const service = load("services/recordingSyncService.js", {
    "firebase/firestore": { doc: pathOf, serverTimestamp: () => server,
      getDocFromServer: async (reference) => { if (denied) throw error("permission-denied"); return snapshot(reference); },
      runTransaction: async (_, action) => action({ get: async (reference) => snapshot(reference),
        set: (reference, value) => { writes.push([reference.path, value]); documents.set(reference.path, value); },
        update: (reference, value) => { writes.push([reference.path, value]); documents.set(reference.path, { ...documents.get(reference.path), ...value }); },
      }),
    },
    "firebase/storage": { ref: (_, value) => value, getMetadata: async (reference) => {
      if (!objects.has(reference)) throw error("storage/object-not-found"); return objects.get(reference);
    } },
    "../config/firebase": { auth, db: {}, storage: {} }, "../constants/recording": constants,
    "../storage/audioStorage": f.audio, "../storage/recordingQueue": f.queue,
    "./audioUploadService": { uploadRecordingAudio: async (...args) => {
      calls.push(args); objects.set(`recordings/${args[2]}/${args[0]}/${args[1]}.m4a`, { generation: "1" });
    } }, "../utils/recordingSyncWorker": worker,
  });
  documents.set("users/alice/sessions/session", { title: "Presentation" });
  service.setRecordingSyncConnection("alice", true);
  return { service, documents, objects, writes, calls, auth, deny: () => { denied = true; } };
}

test("actual Firebase adapter uses canonical paths, exact existing schema/timestamp types, original uploader and receipt", async () => {
  const f = fixture(); await f.save(); const s = serviceFixture(f); await s.service.recordingSync.wake();
  const [documentPath, created] = s.writes[0];
  assert.equal(documentPath, "users/alice/sessions/session/recordings/r1");
  assert.deepEqual(Object.keys(created).sort(), ["audioPath", "createdAt", "durationSeconds", "processingStatus", "sessionId", "updatedAt", "userId"]);
  assert.equal(created.audioPath, "recordings/alice/session/r1.m4a");
  assert.equal(created.processingStatus, "pending_upload"); assert.equal(created.durationSeconds, 42);
  assert.equal(created.userId, "alice"); assert.equal(created.sessionId, "session");
  assert.deepEqual(plain(created.createdAt), { marker: "serverTimestamp" });
  assert.deepEqual(s.calls, [["session", "r1", "alice"]]);
  assert.ok(s.documents.get(documentPath).uploadedAt);
  assert.equal(s.writes.some(([path]) => path === "users/alice/sessions/session"), false);
});

test("actual Firebase adapter preserves advanced status and permission denials never reach uploader", async () => {
  const f = fixture(); await f.save(); const s = serviceFixture(f);
  s.documents.set("users/alice/sessions/session/recordings/r1", { processingStatus: "analysing", uploadedAt: 1 });
  await s.service.recordingSync.wake(); assert.equal(s.calls.length, 0); assert.equal(s.writes.length, 0);
  const g = fixture(); await g.save(); const denied = serviceFixture(g); denied.deny();
  await denied.service.recordingSync.wake(); assert.equal(denied.calls.length, 0); assert.equal(denied.writes.length, 0);
  assert.equal(g.queue.getQueuedRecordings("alice")[0].blocked, true);
});
