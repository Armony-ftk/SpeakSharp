const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformFileSync } = require("@babel/core");

// Same Babel + Node approach as progressSubscription.test.js; no new renderer dependency.
const jsx = (type, props, key) => ({ type, props, key });
function load(file, imports) {
  const filename = path.resolve(__dirname, "../..", file);
  const { code } = transformFileSync(filename, { babelrc: false, configFile: false,
    plugins: [[require.resolve("@babel/plugin-transform-react-jsx"), { runtime: "automatic" }],
      require.resolve("@babel/plugin-transform-modules-commonjs")] });
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "Fragment" };
    assert.ok(name in imports, `Missing mock: ${name}`);
    return imports[name];
  } }, { filename });
  return exports;
}

function hooks() {
  const slots = [];
  let cursor = 0, pending = [], dirty = false;
  const react = {
    createContext: () => ({ Provider: "Provider", current: null }),
    useContext: (context) => context.current,
    useCallback: (fn) => fn,
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === "function" ? initial() : initial;
      return [slots[i], (value) => {
        const next = typeof value === "function" ? value(slots[i]) : value;
        if (slots[i] !== next) dirty = true;
        slots[i] = next;
      }];
    },
    useRef(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: initial };
      return slots[i];
    },
    useEffect(fn, deps) {
      const i = cursor++;
      const old = slots[i];
      if (!old || deps.some((value, index) => value !== old.deps[index])) {
        slots[i] = { deps, cleanup: old?.cleanup };
        pending.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
  };
  return { react,
    render(fn, flush = true) {
      let tree;
      for (let i = 0; i < 20; i++) {
        cursor = 0; dirty = false;
        tree = fn();
        if (!flush) return tree;
        const effects = pending; pending = [];
        effects.forEach((effect) => effect());
        if (!dirty) return tree;
      }
      throw new Error("Render did not settle");
    },
    unmount: () => slots.forEach((slot) => slot?.cleanup?.()),
  };
}

function nodes(tree, type) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, type));
  if (!tree || typeof tree !== "object") return [];
  return [...(tree.type === type ? [tree] : []), ...nodes(tree.props?.children, type)];
}
const textOf = (tree) => nodes(tree, "Text").flatMap((node) => node.props.children).join(" ");
const at = (seconds, nanoseconds = 0) => ({ seconds, nanoseconds });
const rated = (id, rating, seconds = 1) => ({ id, createdAt: at(seconds), processingStatus: "completed", aiFeedback: { overallRating: rating } });

async function fixture() {
  const stats = await import("../../utils/progressStats.js");
  const profileUtils = await import("../../utils/profile.js");
  const theme = await import("../../constants/theme.js");
  const runtime = hooks();
  const listeners = [];
  let context, user = { uid: "alice" }, enabled = true, initializing = false, value, route, dark = false;
  runtime.react.createContext = () => (context = { Provider: "Provider", current: null });
  const auth = { get currentUser() { return user; } };
  const firestore = {
    collection: (_, ...parts) => parts.join("/"), doc: (_, ...parts) => parts.join("/"),
    onSnapshot(reference, next, error) {
      const listener = { reference, next, error, stopped: 0 };
      listeners.push(listener);
      return () => listener.stopped++;
    },
  };
  const authHook = { useAuth: () => ({ currentUser: user, initializing }) };
  const progress = load("hooks/useProgress.js", { react: runtime.react, "firebase/firestore": firestore,
    "../config/firebase": { db: {} }, "./useAuth": authHook, "../utils/progressStats": stats });
  const account = load("context/AccountDataContext.js", { react: runtime.react, "firebase/firestore": firestore,
    "../config/firebase": { db: {} }, "../hooks/useAuth": authHook, "../hooks/useProgress": progress });
  const render = (flush = true) => {
    const tree = runtime.render(() => account.AccountDataProvider({ enabled, children: "Screens" }), flush);
    value = tree.props.value;
    context.current = value;
    return value;
  };
  const imports = {
    "react-native": { ActivityIndicator: "Spinner", StyleSheet: { create: (s) => s }, Text: "Text", View: "View", TouchableOpacity: "TouchableOpacity" },
    "expo-router": { router: { push: (p) => { route = p; }, back: () => { route = "back"; } } },
    "@expo/vector-icons": { Ionicons: "Icon" },
    "../../constants/theme": theme,
    "../../constants/ThemeContext": { useAppTheme: () => ({ colors: dark ? theme.darkColors : theme.lightColors, typography: {} }) },
    "../../context/AccountDataContext": account,
    "../../utils/profile": profileUtils,
    "../../utils/progressStats": stats,
    "../../config/firebase": { auth },
    ...Object.fromEntries(["ScreenContainer", "AppHeader", "LogoMark", "PrimaryButton", "ProfileStatCard",
      "EmptyState", "AuthTextField", "StatCard", "ProgressMetricCard"].map((n) => [`../ui/${n}`, n])),
  };
  const screens = Object.fromEntries(["Home", "Profile", "Progress"].map((name) =>
    [name, load(`components/screens/${name}Screen.js`, imports).default]));
  return { render, listeners, screens, imports, auth, stats, profileUtils,
    user: (next) => { user = next; }, enabled: (next) => { enabled = next; },
    initializing: (next) => { initializing = next; }, dark: (next) => { dark = next; },
    route: () => route, unmount: runtime.unmount,
    listener: (reference) => listeners.findLast((l) => l.reference === reference && !l.stopped),
    profile(data) { this.listener(`users/${user.uid}`).next({ exists: () => data !== null, data: () => data }); },
    emit(reference, documents) {
      this.listener(reference).next({ docs: documents.map(({ id, ...data }) => ({ id, data: () => data })) });
    },
  };
}

test("one shared chain updates all consumers, session ordering, metadata and recording-derived cards", async () => {
  const f = await fixture();
  f.render();
  assert.equal(f.listeners.length, 2);
  assert.equal(nodes(f.screens.Home(), "Spinner").length, 1);
  f.profile({ fullName: "  John\tDoe  ", createdAt: { toDate: () => new Date(2026, 9, 10) } });
  f.emit("users/alice/sessions", [
    { id: "a", title: "Older", status: "active", updatedAt: at(1), attemptCount: 999 },
    { id: "b", title: "Newer", status: "completed", updatedAt: at(2), latestRating: 10 },
  ]);
  f.emit("users/alice/sessions/a/recordings", [rated("one", 6, 1), rated("two", 6, 2)]);
  assert.equal(f.render().loading, true);
  f.emit("users/alice/sessions/b/recordings", [rated("three", 8, 3), rated("four", 8, 4), { id: "pending", processingStatus: "analysing" }]);
  const shared = f.render();
  assert.deepEqual(shared.progress.overview, { sessions: 2, attempts: 5, average: 7, best: 8 });
  assert.equal(shared.progress.comparison.rating.delta, 2);
  assert.equal(shared.sessions[0].id, "b");
  assert.equal(shared.sessions[0].attemptCount, 3);
  assert.equal(shared.sessions[0].latestRating, 8);
  assert.match(textOf(f.screens.Home()), /John/);
  assert.match(textOf(f.screens.Home()), /7.0/);
  assert.deepEqual(nodes(f.screens.Progress(), "StatCard").map((n) => n.props.value), [2, 5, "7.0", "8.0"]);
  let cards = nodes(f.screens.Profile(), "ProfileStatCard");
  assert.deepEqual(cards.map((n) => [n.props.value, n.props.badgeLabel, n.props.badgeTone]), [[2, "Active", "positive"], ["7.0", "+2.0", "positive"]]);
  assert.match(textOf(f.screens.Profile()), /JD.*John\tDoe.*October 2026/s);
  assert.doesNotMatch(textOf(f.screens.Profile()), /Current Goal/);
  nodes(f.screens.Home(), "TouchableOpacity").find((n) => textOf(n).includes("Open Practice Session")).props.onPress();
  assert.equal(f.route(), "/session/a");
  nodes(f.screens.Home(), "TouchableOpacity").find((n) => textOf(n).includes("Newer")).props.onPress();
  assert.equal(f.route(), "/session/b");
  // Consumers and tab revisits never start listeners.
  for (let i = 0; i < 3; i++) Object.values(f.screens).forEach((screen) => screen());
  assert.equal(f.listeners.length, 4);
  f.emit("users/alice/sessions/b/recordings", [rated("three", 8, 3), rated("four", 8, 4), rated("pending", 9, 5)]);
  assert.equal(f.render().progress.overview.average, 7.4);
  assert.match(textOf(f.screens.Home()), /7.4/);
  assert.equal(nodes(f.screens.Profile(), "ProfileStatCard")[1].props.value, "7.4");
  f.emit("users/alice/sessions", [
    { id: "a", title: "Renamed", status: "completed", updatedAt: at(3) },
    { id: "b", title: "Newer", status: "completed", updatedAt: at(2) },
  ]);
  f.render();
  assert.equal(nodes(f.screens.Profile(), "ProfileStatCard")[0].props.badgeLabel, "Inactive");
  assert.match(textOf(f.screens.Home()), /Renamed/);
  assert.equal(f.listeners.length, 4);
  f.emit("users/alice/sessions/b/recordings", [rated("three", 8, 3)]);
  assert.equal(f.render().progress.overview.attempts, 3);
  assert.equal(nodes(f.screens.Profile(), "ProfileStatCard")[1].props.badgeLabel, "—");
  f.emit("users/alice/sessions", [{ id: "a", status: "completed" }]);
  assert.equal(f.render().progress.overview.attempts, 2);
  assert.equal(f.listeners.find((l) => l.reference.endsWith("b/recordings")).stopped, 1);
  f.profile({ fullName: "Armony Fataki" });
  f.render();
  assert.match(textOf(f.screens.Home()), /Armony/);
  assert.match(textOf(f.screens.Profile()), /AF.*Armony Fataki/s);
  f.emit("users/alice/sessions", []); f.render();
  assert.match(textOf(f.screens.Home()), /Ready to practise/);
  nodes(f.screens.Home(), "PrimaryButton")[0].props.onPress();
  assert.equal(f.route(), "/create-session");
  f.unmount();
  assert.ok(f.listeners.every((l) => l.stopped === 1));
});

test("profile retry, missing documents, access gating and account switches clear stale data", async () => {
  const f = await fixture();
  f.enabled(false); f.render();
  assert.equal(f.listeners.length, 0);
  f.enabled(true); f.render();
  f.profile({ fullName: "Alice" });
  f.emit("users/alice/sessions", []);
  f.render();
  const old = f.listener("users/alice");
  old.error({ message: "PRIVATE" });
  let state = f.render();
  assert.equal(state.profile, null);
  assert.match(state.profileErrorMessage, /Could not load/);
  assert.doesNotMatch(state.profileErrorMessage, /PRIVATE/);
  assert.equal(state.errorMessage, "");
  state.retryProfile(); state = f.render();
  assert.equal(state.profileLoading, true);
  assert.equal(f.listeners.length, 3); // Progress listeners were not restarted.
  old.next({ exists: () => true, data: () => ({ fullName: "Stale" }) });
  assert.equal(f.render().profile, null);
  f.profile(null); state = f.render();
  assert.equal(state.profileLoading, false);
  assert.equal(state.profile, null);
  f.profile({ fullName: "Alice" }); f.render();
  f.user({ uid: "bob" });
  state = f.render(false);
  assert.equal(state.profile, null);
  assert.equal(state.sessions.length, 0);
  assert.equal(state.loading, true);
  f.render();
  f.profile({ fullName: "Bob" });
  f.emit("users/bob/sessions", []);
  assert.equal(f.render().profile.fullName, "Bob");
  f.user(null);
  assert.equal(f.render(false).profile, null);
  f.render();
  assert.ok(f.listeners.every((l) => l.stopped === 1));
});

test("profile badges, initials, membership and theme styles handle missing and declining values", async () => {
  const f = await fixture(); f.render();
  f.profile({ fullName: 42, createdAt: "invalid" });
  f.emit("users/alice/sessions", [{ id: "a" }]);
  for (const [ratings, label, tone] of [
    [[6, 6, 8, 8], "+2.0", "positive"], [[8, 8, 8, 8], "0.0", "neutral"],
    [[8, 8, 6, 6], "-2.0", "neutral"], [[8, 8, 6], "—", "neutral"],
  ]) {
    f.emit("users/alice/sessions/a/recordings", ratings.map((rating, i) => rated(String(i), rating, i)));
    f.render();
    const badge = nodes(f.screens.Profile(), "ProfileStatCard")[1].props;
    assert.equal(badge.badgeLabel, label);
    assert.equal(badge.badgeTone, tone);
  }
  assert.match(textOf(f.screens.Home()), /there/);
  assert.match(textOf(f.screens.Profile()), /Name unavailable/);
  for (const name of [null, 42, "", " \t"]) assert.equal(f.profileUtils.getInitials(name), "");
  assert.equal(f.profileUtils.getInitials(" John "), "J");
  assert.equal(f.profileUtils.getInitials(" Armony\tFataki "), "AF");
  for (const date of [null, "invalid", new Date(NaN), { toDate() { throw Error(); } }]) {
    assert.equal(f.profileUtils.formatMemberSince(date), "—");
  }
  const Card = load("components/ui/ProfileStatCard.js", f.imports).default;
  for (const dark of [false, true]) {
    f.dark(dark);
    const card = Card({ badgeLabel: "Inactive", badgeTone: "neutral" });
    const badge = nodes(card, "Text").find((n) => n.props.children === "Inactive");
    assert.ok(badge.props.style[1].color);
    Object.values(f.screens).forEach((screen) => assert.ok(screen()));
  }
  f.unmount();
});

test("session summaries ignore stale aggregates, invalid and undated latest ratings, and preserve timestamp precision", async () => {
  const { getSessionSummaries } = await import("../../utils/progressStats.js");
  const readings = [rated("older", 4, 1), rated("latest", 0, 2), rated("invalid", 11, 5),
    { ...rated("undated", 9), createdAt: null }, { ...rated("pending", 10, 6), processingStatus: "analysing" }];
  let summary = getSessionSummaries([{ data: { id: "a", attemptCount: 999, latestRating: 10 }, recordings: readings }])[0];
  assert.equal(summary.attemptCount, 5);
  assert.equal(summary.latestRating, 0);
  readings.push({ ...rated("nano", 7, 2), createdAt: at(2, 1) });
  summary = getSessionSummaries([{ data: { id: "a" }, recordings: readings }])[0];
  assert.equal(summary.latestRating, 7);
  assert.deepEqual(getSessionSummaries(["a", "b", "c"].map((id) => ({ data: { id, updatedAt: id === "c" ? null : at(2) }, recordings: [] }))).map((s) => s.id), ["b", "a", "c"]);
});

test("edit form prefills, preserves drafts across snapshots, validates, prevents duplicate saves and waits for success", async () => {
  const f = await fixture(); f.render();
  const runtime = hooks();
  let resolve, reject, writes = [];
  const Edit = load("components/screens/EditProfileScreen.js", { ...f.imports, react: runtime.react,
    "../../services/profileService": { updateFullName: (...args) => {
      writes.push(args); return new Promise((yes, no) => { resolve = yes; reject = no; });
    } },
  }).default;
  const render = () => runtime.render(Edit);
  const input = () => nodes(render(), "AuthTextField")[0].props;
  const save = () => nodes(render(), "PrimaryButton").find((n) => n.props.label === "SAVE CHANGES").props;
  assert.equal(input().editable, false);
  f.profile({ fullName: "Alice" }); f.render();
  assert.equal(input().value, "Alice");
  input().onChangeText("   "); await save().onPress();
  assert.equal(writes.length, 0);
  assert.match(textOf(render()), /Enter your full name/);
  input().onChangeText("  Alice Updated  ");
  f.profile({ fullName: "Remote edit" }); f.render();
  assert.equal(input().value, "  Alice Updated  ");
  const button = save();
  const pending = button.onPress(); await button.onPress();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], ["alice", "Alice Updated"]);
  assert.equal(save().loading, true);
  assert.equal(f.route(), undefined);
  reject(new Error("PRIVATE")); await pending;
  assert.equal(save().loading, false);
  assert.equal(input().value, "  Alice Updated  ");
  assert.match(textOf(render()), /Could not save/);
  const success = save().onPress();
  f.profile({ fullName: "Alice Updated" }); f.render();
  assert.match(textOf(f.screens.Profile()), /Alice Updated/);
  resolve(); await success;
  assert.equal(f.route(), "back");
  runtime.unmount(); f.unmount();
});

test("name-only service rejects changed accounts and never writes credentials or timestamps", async () => {
  let user = { uid: "alice" }, written;
  const service = load("services/profileService.js", {
    "../config/firebase": { db: {}, auth: { get currentUser() { return user; } } },
    "firebase/firestore": { doc: (_, ...parts) => parts.join("/"),
      updateDoc: (reference, fields) => { written = { reference, fields }; return Promise.resolve(); } },
  });
  await service.updateFullName("alice", "  Alice Updated  ");
  assert.equal(written.reference, "users/alice");
  assert.deepEqual(Object.keys(written.fields), ["fullName"]);
  assert.equal(written.fields.fullName, "Alice Updated");
  assert.throws(() => service.updateFullName("alice", "  "));
  user = { uid: "bob" };
  assert.throws(() => service.updateFullName("alice", "Old draft"));
  user = null;
  assert.throws(() => service.updateFullName("alice", "Old draft"));
});

test("edit disables missing profiles and ignores save completion after logout or navigation away", async () => {
  for (const leave of ["logout", "unmount"]) {
    const f = await fixture(); f.render(); f.profile(null); f.render();
    const runtime = hooks();
    let resolve;
    const Edit = load("components/screens/EditProfileScreen.js", { ...f.imports, react: runtime.react,
      "../../services/profileService": { updateFullName: () => new Promise((yes) => { resolve = yes; }) },
    }).default;
    const render = () => runtime.render(Edit);
    assert.match(textOf(render()), /profile is missing/);
    assert.equal(nodes(render(), "PrimaryButton")[0].props.disabled, true);
    f.profile({ fullName: "Alice" }); f.render();
    const pending = nodes(render(), "PrimaryButton")[0].props.onPress();
    if (leave === "logout") f.user(null);
    else runtime.unmount();
    resolve(); await pending;
    assert.equal(f.route(), undefined);
    f.unmount();
  }
});

test("root layout shares one keyed provider across tabs and edit profile, inside existing authentication", () => {
  const read = (file) => fs.readFileSync(path.resolve(__dirname, "../..", file), "utf8");
  const layout = read("app/_layout.js");
  assert.equal((layout.match(/<AccountDataProvider\b/g) || []).length, 1);
  assert.match(layout, /<AccountDataProvider key=\{hasAppAccess \? currentUser.uid : 'signed-out'\} enabled=\{hasAppAccess\}>/);
  assert.match(layout, /<AuthProvider>\s*<RootLayoutNav/);
  assert.match(layout, /<AccountDataProvider[\s\S]*name="\(tabs\)"[\s\S]*name="edit-profile"[\s\S]*<\/AccountDataProvider>/);
  for (const screen of ["Home", "Profile", "Progress", "EditProfile"]) {
    const source = read(`components/screens/${screen}Screen.js`);
    assert.match(source, /useAccountData\(\)/);
    assert.doesNotMatch(source, /useProgress\(|onSnapshot\(|getSessions\(|mockProfile/);
  }
  assert.doesNotMatch(read("components/screens/ProfileScreen.js"), /goal|ProgressBar|Current Goal/);
});
