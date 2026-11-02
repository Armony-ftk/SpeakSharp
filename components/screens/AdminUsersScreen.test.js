const React = require("react");
const { act, fireEvent, render } = require("@testing-library/react-native");

jest.mock("../../services/adminService", () => ({ getUsers: jest.fn() }));
jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback) => require("react").useEffect(callback, [callback]),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../ui/ScreenContainer", () => ({ children }) =>
  require("react").createElement(require("react-native").View, null, children),
);

const { ThemeProvider } = require("../../constants/ThemeContext");
const { getUsers } = require("../../services/adminService");
const { router } = require("expo-router");
const AdminUsersScreen = require("./AdminUsersScreen").default;
const user = {
  userId: "user-1", fullName: "Alexandra Ntombizodwa Long Family Name",
  email: "alexandra.long.family.name@university.example", accountStatus: "active", totalSessions: 123456,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.spyOn(console, "warn").mockImplementation(() => {});
  getUsers.mockImplementation(async ({ cursor }) => ({
    items: [cursor ? { ...user, userId: "user-2", fullName: "Another User" } : user],
    total: 2, nextCursor: cursor ? null : "next-users",
  }));
});
afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

test("Users retains search, status filters, pagination and details navigation", async () => {
  const view = await render(<AdminUsersScreen />, { wrapper: ThemeProvider });
  expect(view.getByRole("header", { name: "Users" })).toBeTruthy();
  expect(view.queryByText("Demo Data")).toBeNull();
  expect(view.getByText(user.fullName)).toBeTruthy();
  expect(view.getByText(user.email)).toBeTruthy();
  expect(view.getByText("Sessions: 123456")).toBeTruthy();

  await fireEvent.changeText(view.getByLabelText("Search users by name or email"), "  Alexandra  ");
  await act(async () => jest.advanceTimersByTime(450));
  expect(getUsers).toHaveBeenLastCalledWith({ search: "Alexandra", status: "all", pageSize: 20, cursor: null });
  await fireEvent.press(view.getByRole("tab", { name: "Suspended" }));
  expect(getUsers).toHaveBeenLastCalledWith({ search: "Alexandra", status: "suspended", pageSize: 20, cursor: null });
  await fireEvent.press(view.getByText("Load More"));
  expect(getUsers).toHaveBeenLastCalledWith({ search: "Alexandra", status: "suspended", pageSize: 20, cursor: "next-users" });
  expect(view.getByText("Another User")).toBeTruthy();
  expect(view.getByText(user.fullName)).toBeTruthy();
  expect(view.queryByText("Load More")).toBeNull();
  await fireEvent.press(view.getByText(user.fullName));
  expect(router.push).toHaveBeenCalledWith({ pathname: "/admin/users/[userId]", params: { userId: "user-1" } });
  await fireEvent.press(view.getByLabelText("Open Settings"));
  expect(router.push).toHaveBeenCalledWith("/admin/settings");
});

test.each(["loading", "empty", "error"])("Users retains its %s state", async (state) => {
  if (state === "loading") getUsers.mockReturnValue(new Promise(() => {}));
  if (state === "empty") getUsers.mockResolvedValue({ items: [], total: 0, nextCursor: null });
  if (state === "error") getUsers.mockRejectedValue(new Error("Request failed"));
  const view = await render(<AdminUsersScreen />, { wrapper: ThemeProvider });
  if (state === "loading") expect(view.getByLabelText("Loading users")).toBeTruthy();
  if (state === "empty") expect(view.getByText("No users yet")).toBeTruthy();
  if (state === "error") expect(view.getByText("Couldn’t load users")).toBeTruthy();
});
