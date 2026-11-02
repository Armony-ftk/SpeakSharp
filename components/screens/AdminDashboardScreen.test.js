const React = require("react");
const { act, fireEvent, render } = require("@testing-library/react-native");

jest.mock("../../services/adminService", () => ({
  getAdminStats: jest.fn(),
  getActivityLogs: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: () => ({ userId: "must-not-filter-activity" }),
  useFocusEffect: (callback) => require("react").useEffect(callback, [callback]),
}));

jest.mock("../../constants/ThemeContext", () => ({
  useAppTheme: () => ({
    colors: {
      accent: "#00AEEF",
      card: "#FFFFFF",
      cardBorder: "#D0D5DD",
      border: "#D0D5DD",
      inputBackground: "#F2F4F7",
      navy: "#101828",
      navySoft: "#475467",
      textSecondary: "#475467",
    },
    typography: { body: {}, heading: {} },
  }),
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../ui/ScreenContainer", () => ({ children }) =>
  require("react").createElement(require("react-native").View, null, children),
);

const { getAdminStats, getActivityLogs } = require("../../services/adminService");
const { router } = require("expo-router");
const AdminDashboardScreen = require("./AdminDashboardScreen").default;
const AdminActivityScreen = require("./AdminActivityScreen").default;

// The statistics response deliberately has no activity, as in production.
const stats = {
  totalUsers: 12,
  totalSessions: 34,
  totalRecordings: 56,
  recentlyActiveUsers: 7,
  activityWindowDays: 7,
  recentActivity: null,
};
const events = Array.from({ length: 5 }, (_, index) => ({
  id: `event-${index}`,
  userId: `user-${index}`,
  userName: `User ${index}`,
  type: "session_created",
  label: `Activity ${index}`,
  occurredAt: `2026-11-01T0${9 - index}:00:00.000Z`,
  status: index === 0 ? "failed" : "success",
}));

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function expectStatistics(view) {
  for (const [label, value] of [
    ["Total Users", "12"],
    ["Total Practice Sessions", "34"],
    ["Total Recording Attempts", "56"],
    ["Recently Active Users", "7"],
  ]) {
    expect(view.getByText(label)).toBeTruthy();
    expect(view.getByText(value)).toBeTruthy();
  }
}

beforeEach(() => {
  jest.resetAllMocks();
  getAdminStats.mockResolvedValue(stats);
  getActivityLogs.mockResolvedValue({ events, nextCursor: "next-page" });
  jest.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

test("requests the newest five activities and renders shared row formatting in server order", async () => {
  const view = await render(<AdminDashboardScreen />);

  expect(getActivityLogs).toHaveBeenCalledTimes(1);
  expect(getActivityLogs).toHaveBeenCalledWith({
    type: "all", pageSize: 5, cursor: null,
  });
  expect(view.getAllByText(/^Activity \d$/).map((row) => row.props.children))
    .toEqual(events.map((event) => event.label));
  expect(view.getByText(new Date(events[0].occurredAt).toLocaleString())).toBeTruthy();
  expect(view.getByLabelText("Activity status: Failed")).toBeTruthy();
  expect(view.getAllByLabelText("Activity status: Completed")).toHaveLength(4);
  expect(view.queryByText("Recent activity unavailable")).toBeNull();
  expectStatistics(view);

  await fireEvent.press(view.getByLabelText("View all activity"));
  expect(router.push).toHaveBeenCalledWith("/admin/activity");
  await fireEvent.press(view.getByText("User 0"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/admin/users/[userId]", params: { userId: "user-0" },
  });
});

test("keeps statistics visible while activity loads, then replaces the spinner with rows", async () => {
  const activity = deferred();
  getActivityLogs.mockReturnValue(activity.promise);
  const view = await render(<AdminDashboardScreen />);

  expectStatistics(view);
  expect(view.getByLabelText("Loading recent activity")).toBeTruthy();
  expect(view.queryByText("Recent activity unavailable")).toBeNull();
  expect(view.queryByText("No recent activity yet")).toBeNull();

  await act(async () => activity.resolve({ events, nextCursor: null }));
  expect(view.queryByLabelText("Loading recent activity")).toBeNull();
  expect(view.getAllByText(/^Activity \d$/)).toHaveLength(5);
});

test("shows a friendly empty state and keeps View All available", async () => {
  getActivityLogs.mockResolvedValue({ events: [], nextCursor: null });
  const view = await render(<AdminDashboardScreen />);

  expect(view.getByText("No recent activity yet")).toBeTruthy();
  expect(view.queryByText("Recent activity unavailable")).toBeNull();
  expectStatistics(view);
  await fireEvent.press(view.getByLabelText("View all activity"));
  expect(router.push).toHaveBeenCalledWith("/admin/activity");
});

test("an activity failure does not interrupt pending statistics and refresh can recover", async () => {
  const statistics = deferred();
  getAdminStats.mockReturnValueOnce(statistics.promise);
  getActivityLogs.mockRejectedValueOnce(new Error("Activity unavailable"));
  const view = await render(<AdminDashboardScreen />);

  expect(view.getByLabelText("Loading dashboard statistics")).toBeTruthy();
  await act(async () => statistics.resolve(stats));
  expectStatistics(view);
  expect(view.getByText("Recent activity unavailable")).toBeTruthy();
  expect(view.queryByLabelText("Loading recent activity")).toBeNull();
  await fireEvent.press(view.getByLabelText("View all activity"));
  expect(router.push).toHaveBeenCalledWith("/admin/activity");

  const retryActivity = deferred();
  getActivityLogs.mockReturnValueOnce(retryActivity.promise);
  await fireEvent.press(view.getByText("Refresh"));
  expect(view.getByLabelText("Loading recent activity")).toBeTruthy();
  expect(view.queryByText("Recent activity unavailable")).toBeNull();
  await act(async () => retryActivity.resolve({ events, nextCursor: null }));
  expect(view.getAllByText(/^Activity \d$/)).toHaveLength(5);
  expectStatistics(view);
  expect(getAdminStats).toHaveBeenCalledTimes(2);
  expect(getActivityLogs).toHaveBeenCalledTimes(2);
});

test("refresh ignores an older activity request that finishes after the latest request", async () => {
  const olderRequest = deferred();
  getActivityLogs.mockReturnValueOnce(olderRequest.promise);
  const view = await render(<AdminDashboardScreen />);

  await fireEvent.press(view.getByText("Refresh"));
  expect(view.getAllByText(/^Activity \d$/)).toHaveLength(5);
  await act(async () => olderRequest.resolve({ events: [], nextCursor: null }));
  expect(view.getAllByText(/^Activity \d$/)).toHaveLength(5);
  expect(view.queryByText("No recent activity yet")).toBeNull();
});

test("the Activity screen still fetches its full page and renders the same rows", async () => {
  const view = await render(<AdminActivityScreen />);

  expect(getActivityLogs).toHaveBeenCalledWith({
    type: "all", userId: null, pageSize: 20, cursor: null,
  });
  expect(view.getAllByText(/^Activity \d$/).map((row) => row.props.children))
    .toEqual(events.map((event) => event.label));
  expect(view.getByText("Load More")).toBeTruthy();
  expect(view.getByLabelText("Activity status: Failed")).toBeTruthy();
});

test.each([
  ["Dashboard", AdminDashboardScreen],
  ["Activity", AdminActivityScreen],
])("%s uses a settings gear without a header logout button", async (title, Screen) => {
  const view = await render(<Screen />);
  expect(view.getByRole("header", { name: title })).toBeTruthy();
  expect(view.queryByText("Log out")).toBeNull();
  expect(view.queryByText("Settings")).toBeNull();
  await fireEvent.press(view.getByLabelText("Open Settings"));
  expect(router.push).toHaveBeenCalledWith("/admin/settings");
});

test("Activity has no filters and appends a full second page in server order", async () => {
  const page = Array.from({ length: 20 }, (_, index) => ({
    ...events[0], id: `page-event-${index}`, label: `Recorded event ${index}`,
  }));
  const older = { ...page[0], id: "older", label: "Older recorded event" };
  getActivityLogs.mockImplementation(async ({ cursor }) => cursor
    ? { events: [page[19], older], nextCursor: null }
    : { events: page, nextCursor: "page-2" });
  const view = await render(<AdminActivityScreen />);
  expect(view.getAllByText(/^Recorded event/)).toHaveLength(20);
  expect(view.queryByText("Demo Data")).toBeNull();
  expect(view.queryByLabelText(/Filter activity/)).toBeNull();
  expect(view.queryByText(/Showing activity for/)).toBeNull();

  await fireEvent.press(view.getByText("Load More"));
  expect(getActivityLogs).toHaveBeenLastCalledWith({
    type: "all", userId: null, pageSize: 20, cursor: "page-2",
  });
  expect(view.getAllByText(/^(Recorded event|Older recorded)/).map((row) => row.props.children))
    .toEqual([...page.map((event) => event.label), older.label]);
  expect(view.queryByText("Load More")).toBeNull();
});

test.each(["loading", "empty", "error"])("Activity retains its %s state", async (state) => {
  if (state === "loading") getActivityLogs.mockReturnValue(new Promise(() => {}));
  if (state === "empty") getActivityLogs.mockResolvedValue({ events: [], nextCursor: null });
  if (state === "error") getActivityLogs.mockRejectedValue(new Error("Request failed"));
  const view = await render(<AdminActivityScreen />);
  if (state === "loading") expect(view.getByLabelText("Loading activity")).toBeTruthy();
  if (state === "empty") expect(view.getByText("No activity yet")).toBeTruthy();
  if (state === "error") expect(view.getByText("Couldn’t load activity")).toBeTruthy();
});

test.each([
  [320, 1, "100%"],
  [390, 1, "50%"],
  [430, 1, "50%"],
  [430, 1.6, "100%"],
])("Dashboard adapts statistics at width %s and font scale %s", async (width, fontScale, columnWidth) => {
  const native = require("react-native");
  jest.spyOn(native, "useWindowDimensions").mockReturnValue({ width, height: 844, scale: 3, fontScale });
  getAdminStats.mockResolvedValue({ ...stats, totalRecordings: 123456789 });
  const view = await render(<AdminDashboardScreen />);
  const label = view.getByText("Total Recording Attempts");
  expect(label.props.numberOfLines).toBeUndefined();
  expect(view.getByText("123456789")).toBeTruthy();
  let cell = label.parent;
  while (cell && !["50%", "100%"].includes(native.StyleSheet.flatten(cell.props.style)?.width)) {
    cell = cell.parent;
  }
  expect(native.StyleSheet.flatten(cell.props.style).width).toBe(columnWidth);
});

test.each([
  ["Dashboard", AdminDashboardScreen, "Unknown user"],
  ["Activity", AdminActivityScreen, "Deleted user"],
])("%s distinguishes trusted admin actions while preserving user labels", async (
  _name, Screen, unknownUserLabel,
) => {
  getActivityLogs.mockResolvedValue({
    events: [
      { ...events[0], type: "Admin", action: "suspend", userName: null },
      { ...events[1], type: "Admin", action: "reactivate", userName: "Target User" },
      events[2],
      // A missing name or matching action alone must not imply an admin event.
      { ...events[3], userName: null, action: "suspend" },
      // An admin type alone must not receive a suspend/reactivate description.
      { ...events[4], type: "Admin" },
    ],
    nextCursor: null,
  });
  const view = await render(<Screen />);

  const adminLabels = view.getAllByText("Admin Action");
  expect(adminLabels).toHaveLength(2);
  for (const label of adminLabels) {
    expect(label).toHaveStyle({ color: "#00AEEF" });
  }
  expect(view.getByText("Suspended a user")).toBeTruthy();
  expect(view.getByText("Reactivated a user")).toBeTruthy();
  expect(view.queryByText("Target User")).toBeNull();
  expect(view.queryByText("Action: suspend")).toBeNull();
  expect(view.queryByText("Action: reactivate")).toBeNull();

  for (const name of ["User 2", "User 4", unknownUserLabel]) {
    expect(view.getByText(name)).toHaveStyle({
      color: "#101828", fontSize: 14, fontWeight: "700",
    });
  }
  for (const index of [2, 3, 4]) {
    expect(view.getByText(events[index].label)).toBeTruthy();
  }
  expect(view.getByText(new Date(events[0].occurredAt).toLocaleString())).toBeTruthy();
  expect(view.getByLabelText("Activity status: Failed")).toBeTruthy();
  expect(view.getAllByLabelText("Activity status: Completed")).toHaveLength(4);

  await fireEvent.press(view.getByText("Suspended a user"));
  expect(router.push).toHaveBeenCalledWith({
    pathname: "/admin/users/[userId]", params: { userId: "user-0" },
  });
});
