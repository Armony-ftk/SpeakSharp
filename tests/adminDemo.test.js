const React = require("react");
const { render, fireEvent, waitFor } = require("@testing-library/react-native");

jest.mock("../hooks/useAuth", () => ({ useAuth: jest.fn() }));
jest.mock("../hooks/useAdminAccess", () => ({ useAdminAccess: jest.fn() }));
jest.mock("../services/authService", () => ({ logout: jest.fn(), getAuthErrorMessage: jest.fn() }));
jest.mock("../services/adminService", () => ({ getAdminStats: jest.fn(), getUsers: jest.fn() }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../constants/ThemeContext", () => ({
  useAppTheme: () => ({ colors: { background: "white", textPrimary: "black" }, typography: { body: {}, heading: {} } }),
}));
jest.mock("../components/screens/SplashScreen", () => () => {
  const React = require("react");
  const { Text } = require("react-native");
  return React.createElement(Text, null, "Loading role");
});
jest.mock("../components/ui/ScreenContainer", () => ({ children }) => children);
jest.mock("expo-router", () => {
  const React = require("react");
  const { Text } = require("react-native");
  const router = { replace: jest.fn(), push: jest.fn() };
  const Stack = () => React.createElement(Text, null, "Admin routes");
  Stack.Screen = () => null;
  return { router, useRouter: () => router, useFocusEffect: jest.fn(), Stack,
    Redirect: ({ href }) => React.createElement(Text, null, href) };
});

const { useAuth } = require("../hooks/useAuth");
const { useAdminAccess } = require("../hooks/useAdminAccess");
const { logout } = require("../services/authService");
const { getAdminStats, getUsers } = require("../services/adminService");
const { router } = require("expo-router");
const Index = require("../app/index").default;
const AdminLayout = require("../app/admin/_layout").default;
const Dashboard = require("../components/screens/AdminDashboardScreen").default;
const Users = require("../components/screens/AdminUsersScreen").default;
const Header = require("../components/admin/AdminHeader").default;

beforeEach(() => {
  jest.clearAllMocks();
  useAuth.mockReturnValue({ currentUser: { uid: "admin" }, isEmailVerified: true, role: "admin", roleLoading: false, initializing: false });
  useAdminAccess.mockReturnValue({ status: "allowed", retry: jest.fn() });
});

test.each([
  [{ currentUser: null }, "/sign-in"],
  [{ isEmailVerified: false }, "/verify-email"],
  [{ role: "user" }, "/home"],
  [{ role: "admin" }, "/admin"],
  [{ roleLoading: true }, "Loading role"],
])("entry navigation handles %j", async (state, destination) => {
  useAuth.mockReturnValue({ ...useAuth(), ...state });
  const view = await render(React.createElement(Index));
  expect(view.getByText(destination)).toBeTruthy();
});

test.each([
  [{ currentUser: null }, "denied", "/sign-in"],
  [{ isEmailVerified: false }, "denied", "/verify-email"],
  [{ role: "user" }, "allowed", "/home"],
  [{}, "denied", "/home"],
  [{}, "allowed", "Admin routes"],
])("admin routes require both role and access verification: %j %s", async (state, status, destination) => {
  useAuth.mockReturnValue({ ...useAuth(), ...state });
  useAdminAccess.mockReturnValue({ status, retry: jest.fn() });
  const view = await render(React.createElement(AdminLayout));
  expect(view.getByText(destination)).toBeTruthy();
});

test("dashboard displays session statistics, unavailable metrics, and opens directory", async () => {
  getAdminStats.mockResolvedValue({ totalSessions: 12, totalUsers: null, totalRecordings: null, recentlyActiveUsers: null, activityWindowDays: 7, recentActivity: null });
  const view = await render(React.createElement(Dashboard));
  await waitFor(() => expect(view.getByText("12")).toBeTruthy());
  expect(view.getAllByText("Unavailable")).toHaveLength(3);
  await fireEvent.press(view.getByText("View All Users"));
  expect(router.push).toHaveBeenCalledWith("/admin/users");
});

test("dashboard displays all four numeric statistics and the seven-day label", async () => {
  getAdminStats.mockResolvedValue({ totalUsers: 3, totalSessions: 12, totalRecordings: 25, recentlyActiveUsers: 2, activityWindowDays: 7, recentActivity: null });
  const view = await render(React.createElement(Dashboard));
  await waitFor(() => expect(view.getByText("25")).toBeTruthy());
  for (const value of ["3", "12", "2", "Last 7 days"]) {
    expect(view.getByText(value)).toBeTruthy();
  }
  expect(view.queryByText("Unavailable")).toBeNull();
});

test("dashboard displays legitimate zero statistics", async () => {
  getAdminStats.mockResolvedValue({ totalUsers: 0, totalSessions: 0, totalRecordings: 0, recentlyActiveUsers: 0, activityWindowDays: 7, recentActivity: null });
  const view = await render(React.createElement(Dashboard));
  await waitFor(() => expect(view.getAllByText("0")).toHaveLength(4));
  expect(view.queryByText("Unavailable")).toBeNull();
});

test("directory applies the search and opens the matching user details", async () => {
  getUsers.mockResolvedValue({ items: [{ userId: "normal", fullName: "Demo User", email: "demo@example.test", accountStatus: "active" }], total: 1, nextCursor: null });
  const view = await render(React.createElement(Users));
  await waitFor(() => expect(view.getByText("Demo User")).toBeTruthy());
  await fireEvent.changeText(view.getByLabelText("Search users by name or email"), "demo@example.test");
  await waitFor(() => expect(getUsers).toHaveBeenLastCalledWith({ search: "demo@example.test", status: "all", pageSize: 20, cursor: null }));
  await waitFor(() => expect(view.getByText("Demo User")).toBeTruthy());
  await fireEvent.press(view.getByLabelText(/Demo User, demo@example.test/));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/admin/users/[userId]", params: { userId: "normal" } });
});

test("admin logout uses the shared auth service then returns to sign-in", async () => {
  logout.mockResolvedValue();
  const view = await render(React.createElement(Header, { title: "Admin" }));
  await fireEvent.press(view.getByLabelText("Log out"));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/sign-in"));
  expect(logout).toHaveBeenCalledTimes(1);
});
