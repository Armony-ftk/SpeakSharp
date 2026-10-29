const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { transformFileSync } = require("@babel/core");

// Exercise the actual component handlers with mocked native hosts/hooks. No new
// renderer dependency; visual layout and device file APIs still need Expo Go.
function load(relative, imports) {
  const filename = path.resolve(__dirname, "../..", relative);
  const { code } = transformFileSync(filename, { babelrc: false, configFile: false,
    plugins: [[require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
      require.resolve("@babel/plugin-transform-modules-commonjs")] });
  const exports = {};
  vm.runInNewContext(code, { exports, __DEV__: false, require: (name) => {
    if (name in imports) return imports[name];
    if (name === "react/jsx-runtime") return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    throw new Error(`Unexpected import: ${name}`);
  } }, { filename });
  return exports;
}
const native = { StyleSheet: { create: (value) => value },
  ...Object.fromEntries(["ActivityIndicator", "Text", "TouchableOpacity", "View"].map((name) => [name, name])) };
const theme = { useAppTheme: () => ({ colors: {}, typography: {} }) };
const tokens = { radius: {}, spacing: {} };
function nodes(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap((item) => nodes(item, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function screenFixture() {
  let cursor = 0, focused = false;
  const state = [], refs = [];
  const operation = deferred();
  const data = { calls: [], loads: 0, recordings: [{ id: "first", processingStatus: "completed" }, { id: "second", processingStatus: "pending_upload" }] };
  const imports = {
    react: {
      useCallback: (fn) => fn,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], (next) => { state[index] = typeof next === "function" ? next(state[index]) : next; }];
      },
      useRef: (initial) => { const index = cursor++; return refs[index] ??= { current: initial }; },
    },
    "react-native": native,
    "expo-router": { router: { push() {}, replace() {}, back() {} }, useLocalSearchParams: () => ({ id: "session" }),
      useFocusEffect: (fn) => { if (!focused) { focused = true; fn(); } } },
    "@expo/vector-icons": { Ionicons: "Ionicons" },
    "../../constants/theme": tokens, "../../constants/ThemeContext": theme,
    "../../services/sessionService": { getSessionById: async () => ({ title: "Practice", status: "active" }), getSessionErrorMessage: () => "Refresh failed" },
    "../../services/recordingService": {
      getRecordings: async () => { data.loads++; return data.recordings; },
      deleteRecording: (...args) => { data.calls.push(args); return operation.promise; },
      getRecordingDeletionErrorMessage: () => "Check your connection and retry Delete.",
    },
  };
  for (const name of ["ScreenContainer", "StatCard", "EmptyState", "ActionSheet", "ConfirmDialog", "AttemptListItem", "PrimaryButton"]) imports[`../ui/${name}`] = { default: name, __esModule: true };
  const Screen = load("components/screens/SessionDetailsScreen.js", imports).default;
  const render = () => { cursor = 0; return Screen(); };
  render(); await new Promise(setImmediate);
  const rows = () => nodes(render(), (node) => node.type === "AttemptListItem");
  const dialog = () => nodes(render(), (node) => node.type === "ConfirmDialog" && node.props.title === "Delete recording?")[0];
  return { render, rows, dialog, data, operation };
}

test("every attempt exposes Delete; cancel preserves the list and sends no request", async () => {
  const f = await screenFixture();
  assert.equal(f.rows().length, 2);
  for (const row of f.rows()) assert.equal(typeof row.props.onDelete, "function");
  f.rows()[0].props.onDelete();
  assert.equal(f.dialog().props.visible, true);
  assert.match(f.dialog().props.message, /audio, transcript, metrics and AI feedback/);
  f.dialog().props.onCancel();
  assert.equal(f.dialog().props.visible, false); assert.equal(f.rows().length, 2); assert.equal(f.data.calls.length, 0);
});

test("confirm calls once, blocks duplicate taps, refreshes, and only removes the confirmed recording", async () => {
  const f = await screenFixture(); f.rows()[0].props.onDelete();
  const confirm = f.dialog().props.onConfirm;
  const pending = confirm(); await confirm();
  assert.deepEqual(f.data.calls, [["session", "first"]]);
  assert.equal(f.dialog().props.loading, true);
  assert.ok(f.rows().every((row) => row.props.disabled));
  assert.equal(f.rows()[0].props.deleting, true);
  f.dialog().props.onCancel(); assert.equal(f.dialog().props.visible, true);
  // Even a stale cached refresh cannot reintroduce an acknowledged deletion.
  f.operation.resolve({ success: true }); await pending;
  assert.equal(f.data.loads, 2); assert.equal(f.rows().length, 1);
  assert.equal(f.rows()[0].props.title, "Waiting for upload / processing");
  assert.equal(f.dialog().props.visible, false);
});

test("network failure keeps both recordings visible and displays an understandable error", async () => {
  const f = await screenFixture(); f.rows()[1].props.onDelete();
  const pending = f.dialog().props.onConfirm();
  f.operation.reject({ code: "functions/unavailable" }); await pending;
  assert.equal(f.rows().length, 2); assert.ok(f.rows().every((row) => !row.props.disabled));
  assert.ok(nodes(f.render(), (node) => node.type === "Text").some((node) => /Check your connection/.test(node.props.children)));
});

test("device cleanup failure reports cloud success separately", async () => {
  const f = await screenFixture(); f.rows()[0].props.onDelete();
  const pending = f.dialog().props.onConfirm(); f.operation.resolve({ success: true, localCleanupFailed: true }); await pending;
  assert.equal(f.rows().length, 1);
  assert.ok(nodes(f.render(), (node) => node.type === "Text").some((node) => /deleted from the cloud/.test(node.props.children)));
});

test("attempt trash control is accessible, separate from navigation and disabled while deleting", () => {
  const Component = load("components/ui/AttemptListItem.js", { "react-native": native,
    "@expo/vector-icons": { Ionicons: "Ionicons" }, "../../constants/theme": tokens, "../../constants/ThemeContext": theme }).default;
  let opens = 0, deletes = 0;
  const props = { number: 2, onPress: () => opens++, onDelete: () => deletes++ };
  const buttons = nodes(Component(props), (node) => node.type === "TouchableOpacity");
  assert.equal(buttons.length, 2); buttons[1].props.onPress(); assert.equal(deletes, 1); assert.equal(opens, 0);
  assert.equal(buttons[1].props.accessibilityLabel, "Delete attempt 2");
  const busy = nodes(Component({ ...props, deleting: true }), (node) => node.type === "TouchableOpacity");
  assert.ok(busy.every((node) => node.props.disabled));
});

test("recording service requires acknowledged cloud success before exact-mapped local cleanup", async () => {
  let response = { success: true }, failCloud = false, failLocal = false;
  const calls = [];
  const service = load("services/recordingService.js", {
    "firebase/firestore": {}, "../config/firebase": { auth: { currentUser: { uid: "owner" } } },
    "../constants/recordindStatuses": { RECORDING_STATUS: {} }, "../constants/recording": {},
    "./processingService": { requestRecordingDeletion: async (...args) => { calls.push(["cloud", ...args]); if (failCloud) throw new Error("offline"); return response; } },
    "../storage/audioStorage": { deleteLocalRecording: async (id, options) => { calls.push(["local", id, options.onlyMapped]); if (failLocal) throw new Error("file unavailable"); } },
  });
  await service.deleteRecording("session", "first");
  assert.deepEqual(calls, [["cloud", "session", "first"], ["local", "first", true]]);
  calls.length = 0; failCloud = true;
  await assert.rejects(service.deleteRecording("session", "first")); assert.equal(calls.length, 1);
  failCloud = false; response = { success: false }; calls.length = 0;
  await assert.rejects(service.deleteRecording("session", "first")); assert.equal(calls.length, 1);
  response = { success: true }; failLocal = true;
  assert.equal((await service.deleteRecording("session", "first")).localCleanupFailed, true);
  assert.match(service.getRecordingDeletionErrorMessage({ code: "functions/deadline-exceeded" }), /may already have reached the server/);
});

test("local cleanup refuses another recording's mapping and preserves unmapped/offline files", async () => {
  let mappings = { first: "file:///documents/SpeakSharp/recordings/second.m4a" };
  const removed = [];
  class Directory { constructor(...parts) { this.uri = parts.map((part) => part.uri ?? part).join("/"); } }
  class File extends Directory { exists = true; delete() { removed.push(this.uri); } }
  const storage = load("storage/audioStorage.js", {
    "@react-native-async-storage/async-storage": { __esModule: true, default: {
      getItem: async () => JSON.stringify(mappings), setItem: async (_, value) => { mappings = JSON.parse(value); },
    } },
    "expo-file-system": { Directory, File, Paths: { document: "file:///documents", cache: "file:///cache" } },
  });
  await assert.rejects(storage.deleteLocalRecording("first", { onlyMapped: true })); assert.equal(removed.length, 0);
  await storage.deleteLocalRecording("unmapped", { onlyMapped: true }); assert.equal(removed.length, 0);
  mappings.first = "file:///documents/SpeakSharp/recordings/first.m4a";
  mappings.second = "file:///documents/SpeakSharp/recordings/second.m4a";
  await storage.deleteLocalRecording("first", { onlyMapped: true });
  assert.deepEqual(removed, ["file:///documents/SpeakSharp/recordings/first.m4a"]);
  assert.equal(mappings.first, undefined); assert.ok(mappings.second);
});
