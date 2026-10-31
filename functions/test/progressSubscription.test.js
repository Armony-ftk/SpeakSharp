const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { transformFileSync } = require("@babel/core");

// Use the existing Babel/Node test setup to exercise the real hook with snapshots.
async function fixture() {
  const stats = await import("../../utils/progressStats.js");
  const listeners = [], states = [];
  let user = { uid: "alice" }, cursor = 0, dependencies, pendingEffect, cleanup;
  let writes = 0;
  const imports = {
    react: {
      useCallback: (fn) => fn,
      useState: (initial) => {
        const index = cursor++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => {
          const next = typeof value === "function" ? value(states[index]) : value;
          if (next !== states[index]) writes++;
          states[index] = next;
        }];
      },
      useEffect: (fn, deps) => {
        if (!dependencies || deps.some((value, index) => value !== dependencies[index])) {
          dependencies = deps;
          pendingEffect = fn;
        }
      },
    },
    "firebase/firestore": {
      collection: (_, ...segments) => segments.join("/"),
      onSnapshot: (reference, next, error) => {
        const listener = { reference, next, error, unsubscribed: 0 };
        listeners.push(listener);
        return () => { listener.unsubscribed++; };
      },
    },
    "../config/firebase": { db: {} },
    "./useAuth": { useAuth: () => ({ currentUser: user, initializing: false }) },
    "../utils/progressStats": stats,
  };
  const filename = path.resolve(__dirname, "../../hooks/useProgress.js");
  const { code } = transformFileSync(filename, { babelrc: false, configFile: false,
    plugins: [require.resolve("@babel/plugin-transform-modules-commonjs")] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in imports, name);
    return imports[name];
  } }, { filename });
  const render = (flush = true) => {
    cursor = 0;
    const result = exports.useProgress();
    if (flush && pendingEffect) {
      cleanup?.();
      const effect = pendingEffect;
      pendingEffect = null;
      cleanup = effect();
    }
    return result;
  };
  return {
    listeners, render, user: (value) => { user = value; }, unmount: () => cleanup?.(),
    writes: () => writes,
    emit: (listener, documents) => listener.next({ docs: documents.map(({ id, ...data }) => ({ id, data: () => data })) }),
  };
}
const rated = (id, rating) => ({ id, processingStatus: "completed", aiFeedback: { overallRating: rating }, createdAt: { seconds: 1, nanoseconds: 0 } });

test("waits for every initial collection, reuses listeners, and updates additions, completion and deletions", async () => {
  const f = await fixture();
  assert.equal(f.render().loading, true);
  f.emit(f.listeners[0], [{ id: "a" }, { id: "b" }]);
  assert.deepEqual(f.listeners.map((l) => l.reference), ["users/alice/sessions", "users/alice/sessions/a/recordings", "users/alice/sessions/b/recordings"]);
  f.emit(f.listeners[1], [rated("one", 8)]);
  assert.equal(f.render().loading, true);
  f.emit(f.listeners[2], [{ id: "two", processingStatus: "analysing" }]);
  let result = f.render();
  assert.equal(result.loading, false);
  assert.equal(result.progress.overview.attempts, 2);
  assert.equal(result.progress.overview.average, 8);
  const writes = f.writes();
  f.emit(f.listeners[0], [{ id: "b", attemptCount: 900 }, { id: "a", latestRating: 0 }]);
  assert.equal(f.listeners.length, 3);
  assert.equal(f.writes(), writes + 1); // Session metadata now updates Home/Profile too.
  assert.equal(f.render().sessions.find((s) => s.id === "b").attemptCount, 1);
  f.emit(f.listeners[2], [rated("two", 4)]);
  assert.equal(f.render().progress.overview.average, 6);
  f.emit(f.listeners[1], []);
  assert.equal(f.render().progress.overview.attempts, 1);
  f.emit(f.listeners[0], [{ id: "b" }, { id: "c" }]);
  assert.equal(f.listeners[1].unsubscribed, 1);
  assert.equal(f.render().loading, true);
  f.emit(f.listeners[3], [rated("three", 10)]);
  assert.equal(f.render().progress.overview.best, 10);
  f.emit(f.listeners[0], [{ id: "b" }]);
  assert.equal(f.listeners[3].unsubscribed, 1);
  assert.equal(f.render().progress.overview.best, 4);
  f.emit(f.listeners[3], [rated("late callback", 10)]);
  assert.equal(f.render().progress.overview.attempts, 1);
  f.unmount();
  assert.ok(f.listeners.every((l) => l.unsubscribed === 1));
  const afterCleanup = f.writes();
  f.emit(f.listeners[0], [{ id: "late session" }]);
  f.emit(f.listeners[2], [rated("late recording", 10)]);
  assert.equal(f.writes(), afterCleanup);
});

test("no sessions and sessions without recordings finish loading with zero attempts", async () => {
  const f = await fixture();
  f.render();
  f.emit(f.listeners[0], []);
  assert.equal(f.render().loading, false);
  assert.equal(f.render().progress.overview.sessions, 0);
  f.emit(f.listeners[0], [{ id: "empty" }]);
  assert.equal(f.render().loading, true);
  f.emit(f.listeners[1], []);
  assert.equal(f.render().loading, false);
  assert.equal(f.render().progress.overview.sessions, 1);
  assert.equal(f.render().progress.overview.attempts, 0);
  f.unmount();
});

test("parent and child errors hide partial results, stop subscriptions and retry fresh listeners", async () => {
  for (const errorIndex of [0, 1]) {
    const f = await fixture();
    f.render();
    f.emit(f.listeners[0], [{ id: "a" }]);
    f.emit(f.listeners[1], [rated("one", 8)]);
    f.listeners[errorIndex].error({ code: "permission-denied", message: "PRIVATE" });
    const failed = f.render();
    assert.equal(failed.loading, false);
    assert.match(failed.errorMessage, /Unable to access/);
    assert.equal(failed.progress.overview.attempts, 0);
    assert.ok(f.listeners.every((l) => l.unsubscribed === 1));
    failed.retry();
    assert.equal(f.render().loading, true);
    f.emit(f.listeners[2], [{ id: "a" }]);
    f.emit(f.listeners[3], [rated("one", 8)]);
    assert.equal(f.render().errorMessage, "");
    assert.equal(f.render().progress.overview.average, 8);
    f.unmount();
    assert.ok(f.listeners.every((l) => l.unsubscribed === 1));
  }
});

test("switching accounts and logout hide data before effects run and ignore old callbacks", async () => {
  const f = await fixture();
  f.render();
  f.emit(f.listeners[0], [{ id: "a" }]);
  f.emit(f.listeners[1], [rated("one", 8)]);
  f.user({ uid: "bob" });
  const beforeCleanup = f.render(false);
  assert.equal(beforeCleanup.progress.overview.attempts, 0);
  assert.equal(beforeCleanup.loading, true);
  f.render();
  assert.equal(f.listeners[0].unsubscribed, 1);
  assert.equal(f.listeners[1].unsubscribed, 1);
  assert.equal(f.listeners[2].reference, "users/bob/sessions");
  f.emit(f.listeners[1], [rated("stale", 10)]);
  f.emit(f.listeners[2], []);
  assert.equal(f.render().progress.overview.attempts, 0);
  f.user(null);
  assert.equal(f.render(false).progress.overview.attempts, 0);
  f.render();
  assert.equal(f.listeners[2].unsubscribed, 1);
  assert.equal(f.listeners.length, 3);
});

test("recreating a removed session ignores callbacks from its old listener and preserves legacy status", async () => {
  const f = await fixture();
  f.render();
  f.emit(f.listeners[0], [{ id: "a" }]);
  f.emit(f.listeners[1], [rated("one", 8)]);
  f.emit(f.listeners[0], []);
  f.emit(f.listeners[0], [{ id: "a" }]);
  f.emit(f.listeners[1], [rated("stale", 10)]);
  assert.equal(f.render().loading, true);
  f.listeners[1].error({ code: "permission-denied" });
  assert.equal(f.render().errorMessage, "");
  f.emit(f.listeners[2], [{ ...rated("legacy", 3), processingStatus: undefined, status: "completed" }]);
  assert.equal(f.render().progress.overview.average, 3);
  f.unmount();
});

test("screen renders loading, retry, empty navigation, unrated attempts and the existing comparison cards", async () => {
  const stats = await import("../../utils/progressStats.js");
  let retries = 0, route;
  let state = { progress: stats.calculateProgress(0, []), loading: true, errorMessage: "", retry: () => retries++ };
  const imports = {
    "react-native": { StyleSheet: { create: (s) => s }, ActivityIndicator: "Spinner", View: "View", Text: "Text" },
    "expo-router": { router: { push: (path) => { route = path; } } },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "../../constants/theme": { radius: {}, spacing: {} },
    "../../constants/ThemeContext": { useAppTheme: () => ({ colors: {}, typography: {} }) },
    "../../context/AccountDataContext": { useAccountData: () => state },
    "../../utils/progressStats": stats,
    ...Object.fromEntries(["ScreenContainer", "AppHeader", "StatCard", "ProgressMetricCard", "EmptyState"]
      .map((name) => [`../ui/${name}`, name])),
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: "Fragment",
    },
  };
  const filename = path.resolve(__dirname, "../../components/screens/ProgressScreen.js");
  const { code } = transformFileSync(filename, { babelrc: false, configFile: false,
    plugins: [[require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
      require.resolve("@babel/plugin-transform-modules-commonjs")] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    assert.ok(name in imports, name);
    return imports[name];
  } }, { filename });
  function nodes(tree, type) {
    if (Array.isArray(tree)) return tree.flatMap((node) => nodes(node, type));
    if (!tree || typeof tree !== "object") return [];
    return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
  }
  const screen = () => exports.default();
  assert.equal(nodes(screen(), "Spinner").length, 1);
  assert.equal(nodes(screen(), "EmptyState").length, 0);
  state = { ...state, loading: false, errorMessage: "Could not load your progress." };
  const error = nodes(screen(), "EmptyState")[0];
  assert.equal(error.props.actionLabel, "TRY AGAIN");
  error.props.onAction();
  assert.equal(retries, 1);
  state = { ...state, errorMessage: "", progress: stats.calculateProgress(2, []) };
  nodes(screen(), "EmptyState")[0].props.onAction();
  assert.equal(route, "/create-session");
  state.progress = stats.calculateProgress(2, [{ processingStatus: "failed" }]);
  assert.deepEqual(nodes(screen(), "StatCard").map((node) => node.props.value), [2, 1, "—", "—"]);
  assert.equal(nodes(screen(), "ProgressMetricCard").length, 3);
  assert.ok(nodes(screen(), "ProgressMetricCard").every((node) => node.props.delta === "Unavailable"));
  assert.equal(nodes(screen(), "AppHeader").length, 1);
  const text = () => nodes(screen(), "Text").map((node) => node.props.children).flat().join(" ");
  for (let count = 0; count < 4; count++) {
    state.progress = stats.calculateProgress(2, [
      { processingStatus: "failed" },
      ...Array.from({ length: count }, (_, index) => rated(String(index), 6)),
    ]);
    assert.match(text(), new RegExp(`Comparisons need 4.*\\(${count}/4 available\\)`));
    assert.ok(nodes(screen(), "ProgressMetricCard").every((node) => node.props.delta === "Unavailable"));
  }
  state.progress = stats.calculateProgress(2, Array.from({ length: 4 }, (_, index) => rated(String(index), index + 5)));
  assert.match(text(), /Latest 2 rated attempts compared with the previous 2/);
  assert.match(text(), /latest two attempts/);
  assert.ok(nodes(screen(), "ProgressMetricCard").every((node) =>
    node.props.previousLabel === "Previous 2" && node.props.currentLabel === "Latest 2"));
  assert.equal(nodes(screen(), "ProgressMetricCard")[0].props.delta, "+2.0");
});
