const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { transformFileSync } = require("@babel/core");

// Render the actual screen with controlled snapshots and native element stubs.
// Reuse the Node/Babel approach in functions/test/progressSubscription.test.js.
const filename = path.resolve(__dirname, "../components/screens/AttemptFlowScreen.js");
const { code } = transformFileSync(filename, {
  babelrc: false, configFile: false,
  plugins: [[require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
    require.resolve("@babel/plugin-transform-modules-commonjs")],
});
const timestamp = (millis) => ({ toMillis: () => millis });
const now = 10_000_000;
const uploaded = { processingStatus: "pending_upload", uploadedAt: timestamp(now) };
const transcribed = { ...uploaded, processingStatus: "transcript_ready", transcript: { originalText: "Hello everyone." } };
const measured = { ...transcribed, updatedAt: timestamp(now),
  metrics: { wordCount: 2, wordsPerMinute: 12, fillerCount: 0, fillerWords: {}, targetDurationStatus: null } };
const analysing = { ...measured, processingStatus: "analysing", analysisJob: { startedAt: timestamp(now) } };
const failed = (stage) => ({ ...(stage === "analysis" ? measured : stage.startsWith("metrics") ? transcribed : uploaded),
  processingStatus: "failed", processingError: { stage, code: "test_failure" } });

async function fixture(initial, options = {}) {
  const metrics = await import("../utils/metricsProgress.js");
  const analysis = await import("../utils/analysisProgress.js");
  const feedback = await import("../utils/recordingFeedback.js");
  const statuses = await import("../constants/recordindStatuses.js");
  const hooks = [], effects = [], calls = [];
  let cursor = 0, current = initial, nextSnapshot, listenerError, tree, time = now;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => value === right[index]);
  const memo = (create, deps) => {
    const index = cursor++;
    if (!hooks[index] || !same(hooks[index].deps, deps)) hooks[index] = { deps, value: create() };
    return hooks[index].value;
  };
  const react = {
    useState: (initialValue) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initialValue;
      return [hooks[index], (value) => { hooks[index] = typeof value === "function" ? value(hooks[index]) : value; }];
    },
    useRef: (value) => memo(() => ({ current: value }), []),
    useCallback: (fn, deps) => memo(() => fn, deps),
    useEffect: (fn, deps) => {
      const index = cursor++;
      if (!hooks[index] || !same(hooks[index].deps, deps)) {
        const previous = hooks[index];
        hooks[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = fn(); });
      }
    },
  };
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key });
  const imports = {
    react,
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "Fragment" },
    "react-native": { ActivityIndicator: "Spinner", Text: "Text", View: "View", TouchableOpacity: "Touch", StyleSheet: { create: (value) => value } },
    "expo-router": { useLocalSearchParams: () => ({ id: "session", recordingId: options.id ?? "recording" }), router: { replace: (...args) => calls.push(["navigate", ...args]) } },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "../ui/ScreenContainer": "Screen",
    "../ui/PrimaryButton": "Button",
    "../../constants/theme": { radius: {}, spacing: {} },
    "../../constants/ThemeContext": { useAppTheme: () => ({ colors: {}, typography: {} }) },
    "../../constants/recordindStatuses": statuses,
    "../../utils/metricsProgress": metrics,
    "../../utils/analysisProgress": analysis,
    "../../utils/recordingFeedback": feedback,
    "./RecordingFeedbackView": "Feedback",
    "../../services/sessionService": { getSessionById: async () => ({ title: "Session" }) },
    "../../services/recordingService": {
      getRecording: async () => current,
      subscribeToRecording: (_sid, _rid, next, error) => {
        nextSnapshot = next; listenerError = error; next(current);
        return () => {};
      },
      markRecordingUploaded: async (...args) => { calls.push(["markUploaded", ...args]); },
      getTranscriptionErrorMessage: () => "Transcription error",
    },
    "../../services/audioUploadService": {
      uploadRecordingAudio: async (...args) => { calls.push(["upload", ...args]); return options.upload ? options.upload() : "audio.m4a"; },
      getUploadErrorMessage: () => "Upload error",
    },
    "../../services/processingService": {
      requestAnalysisRetry: async (...args) => { calls.push(["retryAnalysis", ...args]); return options.retry?.(); },
    },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, Date: { now: () => time }, require: (name) => {
    assert.ok(name in imports, `Unexpected import: ${name}`);
    return imports[name];
  } }, { filename });
  const root = exports.default();
  const render = () => {
    cursor = 0;
    tree = root.type(root.props);
    while (effects.length) effects.shift()();
    return tree;
  };
  const settle = async () => { await new Promise(setImmediate); render(); };
  const nodes = (node = tree) => {
    if (Array.isArray(node)) return node.flatMap((child) => nodes(child));
    if (!node || typeof node !== "object") return [];
    return [node, ...nodes(node.props?.children ?? null)];
  };
  const buttons = () => nodes().filter((node) => node.type === "Button");
  render();
  await settle();
  return {
    root, calls, render, settle, nodes,
    emit: (recording) => { current = recording; nextSnapshot(recording); render(); },
    error: () => { listenerError(); render(); },
    advance: (milliseconds) => { time += milliseconds; render(); },
    retries: () => buttons().filter((node) => node.props.label.startsWith("RETRY")).map((node) => node.props.label),
    press: (label) => { const button = buttons().find((node) => node.props.label === label); assert.ok(button, label); return button.props.onPress(); },
    steps: () => nodes().filter((node) => node.type === "View" && Array.isArray(node.props.children)
      && ["Icon", "Spinner"].includes(node.props.children[0]?.type))
      .map((row) => ({ label: row.props.children[1].props.children,
        visual: row.props.children[0].type === "Spinner" ? "spinner" : row.props.children[0].props.name })),
  };
}

test("upload completion waits without Retry, including long gaps and rapid stage snapshots", async () => {
  let finishUpload;
  const f = await fixture({ processingStatus: "pending_upload" }, { upload: () => new Promise((resolve) => { finishUpload = resolve; }) });
  assert.equal(f.steps()[0].visual, "spinner");
  assert.deepEqual(f.retries(), []);
  finishUpload("audio.m4a");
  await f.settle();
  assert.equal(f.steps()[0].visual, "checkmark-circle");
  f.advance(24 * 60 * 60 * 1000);
  assert.deepEqual(f.retries(), []);
  assert.equal(f.steps()[1].visual, "ellipse-outline");
  f.advance(-24 * 60 * 60 * 1000);
  for (const snapshot of [uploaded, { ...uploaded, processingStatus: "transcribing" }, transcribed, measured, analysing]) {
    f.emit(snapshot);
    assert.equal(f.steps()[0].visual, "checkmark-circle");
    assert.deepEqual(f.retries(), []);
  }
});

test("only existing evidence completes stages or activates their spinners on re-entry", async () => {
  for (const [snapshot, expected] of [
    [uploaded, ["checkmark-circle", "ellipse-outline", "ellipse-outline", "ellipse-outline"]],
    [{ ...uploaded, processingStatus: "transcribing" }, ["checkmark-circle", "spinner", "ellipse-outline", "ellipse-outline"]],
    [transcribed, ["checkmark-circle", "checkmark-circle", "spinner", "ellipse-outline"]],
    [measured, ["checkmark-circle", "checkmark-circle", "checkmark-circle", "ellipse-outline"]],
    [analysing, ["checkmark-circle", "checkmark-circle", "checkmark-circle", "spinner"]],
  ]) {
    const f = await fixture(snapshot);
    assert.deepEqual(f.steps().map((step) => step.visual), expected);
    assert.deepEqual(f.retries(), []);
    assert.equal(f.calls.length, 0);
  }
  const f = await fixture({ ...transcribed, metrics: { wordCount: 2 } });
  assert.equal(f.steps()[2].visual, "spinner");
  assert.equal(f.steps()[3].visual, "ellipse-outline");
});

test("listener progress can arrive before upload settles without conflicting upload visuals", async () => {
  let finishUpload;
  const f = await fixture({ processingStatus: "pending_upload" }, { upload: () => new Promise((resolve) => { finishUpload = resolve; }) });
  f.emit({ processingStatus: "transcribing" });
  assert.deepEqual(f.steps()[0], { label: "Recording uploaded", visual: "checkmark-circle" });
  assert.equal(f.steps()[1].visual, "spinner");
  assert.deepEqual(f.retries(), []);
  finishUpload("audio.m4a");
  await f.settle();
  f.emit(transcribed);
  f.advance(24 * 60 * 60 * 1000);
  assert.equal(f.steps()[1].visual, "checkmark-circle");
  assert.deepEqual(f.retries(), []);
  f.emit(failed("metrics_saving"));
  assert.equal(f.steps()[2].visual, "warning-outline");
});

test("AI waiting and running retain checks while preserving the existing stall recovery", async () => {
  for (const snapshot of [measured, analysing]) {
    const f = await fixture(snapshot);
    f.advance(6 * 60 * 1000);
    assert.deepEqual(f.retries(), []);
    f.advance(1);
    assert.deepEqual(f.retries(), ["RETRY AI ANALYSIS"]);
    assert.deepEqual(f.steps().slice(0, 3).map((step) => step.visual), Array(3).fill("checkmark-circle"));
    await f.press("RETRY AI ANALYSIS");
    assert.deepEqual(f.calls, [["retryAnalysis", "session", "recording"]]);
    f.emit({ ...measured, updatedAt: timestamp(now + 6 * 60 * 1000 + 1) });
    assert.deepEqual(f.retries(), []);
  }
  const reopened = await fixture({ ...analysing, analysisJob: { startedAt: timestamp(now - 6 * 60 * 1000 - 1) } });
  assert.deepEqual(reopened.retries(), ["RETRY AI ANALYSIS"]);
});

test("real upload, transcription, metrics, AI and listener errors keep their recovery UI", async () => {
  let failUpload = true;
  const upload = await fixture({ processingStatus: "pending_upload" }, { upload: () => {
    if (failUpload) throw new Error("Upload failed");
    return "audio.m4a";
  } });
  assert.deepEqual(upload.retries(), ["RETRY UPLOAD"]);
  assert.equal(upload.steps()[0].visual, "warning-outline");
  failUpload = false;
  await upload.press("RETRY UPLOAD");
  await upload.settle();
  assert.deepEqual(upload.retries(), []);
  assert.equal(upload.steps()[0].visual, "checkmark-circle");
  for (const [stage, retry, index] of [["transcription", ["RETRY TRANSCRIPTION"], 1],
    ["metrics", [], 2], ["metrics_saving", [], 2], ["analysis", ["RETRY AI ANALYSIS"], 3]]) {
    const f = await fixture(failed(stage));
    assert.deepEqual(f.retries(), retry);
    assert.equal(f.steps()[index].visual, "warning-outline");
    if (stage === "transcription") {
      await f.press("RETRY TRANSCRIPTION");
      assert.equal(f.calls[0][0], "upload");
      f.emit({ ...uploaded, processingStatus: "transcribing" });
      assert.deepEqual(f.retries(), []);
      assert.equal(f.steps()[1].visual, "spinner");
    }
  }
  const f = await fixture(analysing);
  f.error();
  assert.ok(f.nodes().some((node) => node.props.label === "RECONNECT"));
  assert.ok(!f.steps().some((step) => step.visual === "spinner"));
  f.emit(null);
  assert.ok(f.nodes().some((node) => node.props.children === "This recording is unavailable or has been deleted."));
});

test("AI retry failures remain visible and a new recording has fresh presentation state", async () => {
  const f = await fixture(failed("analysis"), { retry: () => { throw new Error("Retry failed"); } });
  await f.press("RETRY AI ANALYSIS");
  await f.settle();
  assert.ok(f.nodes().some((node) => typeof node.props.children === "string" && node.props.children.startsWith("Could not request AI analysis")));
  const fresh = await fixture({ processingStatus: "pending_upload" }, { id: "new-recording", upload: () => new Promise(() => {}) });
  assert.notEqual(f.root.key, fresh.root.key);
  assert.equal(fresh.steps()[0].visual, "spinner");
  assert.deepEqual(fresh.retries(), []);
  assert.ok(fresh.steps().slice(1).every((step) => step.visual === "ellipse-outline"));
});

test("completed recordings keep the existing feedback view and incomplete-feedback recovery", async () => {
  const scores = (keys) => Object.fromEntries(keys.map((key) => [key, { score: 7, feedback: "Saved feedback" }]));
  const complete = { ...measured, processingStatus: "completed", aiFeedback: {
    overallRating: 7, overallSummary: "Saved summary",
    criteriaScores: scores(["clarity", "logicalStructure", "contentRelevance", "conciseness", "audienceOrientation"]),
    structureFeedback: scores(["introduction", "body", "conclusion"]),
    strengths: ["One", "Two", "Three"], improvements: ["One", "Two", "Three"], audienceQuestions: ["One?", "Two?", "Three?"],
  } };
  const f = await fixture(analysing);
  f.emit(complete);
  assert.equal(f.render().type, "Feedback");
  const reopened = await fixture(complete);
  assert.equal(reopened.render().type, "Feedback");
  assert.equal(reopened.render().props.recording, complete);
  f.emit({ ...complete, aiFeedback: null });
  assert.ok(f.nodes().some((node) => node.props.label === "RECONNECT"));
  assert.deepEqual(f.retries(), []);
});
