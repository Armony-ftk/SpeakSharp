const React = require("react");
const { Text, View, Linking } = require("react-native");
const { fireEvent, render } = require("@testing-library/react-native");

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true, default: { getItem: jest.fn(), setItem: jest.fn() },
}));
jest.mock("../../services/authService", () => ({ logout: jest.fn(), getAuthErrorMessage: () => "Please try again." }));
jest.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ currentUser: { uid: "admin" }, isEmailVerified: true, role: "admin" }) }));
jest.mock("../../hooks/useAdminAccess", () => ({ useAdminAccess: () => ({ status: "allowed" }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("react-native").View,
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => {
  const React = require("react");
  const { Text, View } = require("react-native");
  const Stack = jest.fn(({ children }) => React.createElement(View, null, children));
  Stack.Screen = ({ name }) => React.createElement(Text, null, name);
  const Tabs = jest.fn(({ children }) => React.createElement(View, null, children));
  Tabs.Screen = ({ name }) => React.createElement(Text, null, name);
  return {
    Stack, Tabs, Redirect: ({ href }) => React.createElement(Text, null, href),
    router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn() },
  };
});

const AsyncStorage = require("@react-native-async-storage/async-storage").default;
const { router, Tabs } = require("expo-router");
const { logout } = require("../../services/authService");
const { ThemeProvider, useAppTheme } = require("../../constants/ThemeContext");
const { ADMIN_DARK_MODE_KEY, ADMIN_NOTIFICATIONS_KEY } = require("../../constants/adminPreferences");
const AdminSettingsScreen = require("./AdminSettingsScreen").default;
const AdminHeader = require("../admin/AdminHeader").default;
const ConfirmDialog = require("../ui/ConfirmDialog").default;
const AdminLayout = require("../../app/admin/_layout").default;
const AdminTabsLayout = require("../../app/admin/(tabs)/_layout").default;
const stored = new Map();

function ThemeProbe() {
  const { isDark } = useAppTheme();
  return <Text testID="current-theme">{isDark ? "dark" : "light"}</Text>;
}
function Wrapper({ children }) {
  return <ThemeProvider>{children}<ThemeProbe /></ThemeProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  stored.clear();
  AsyncStorage.getItem.mockImplementation(async (key) => stored.get(key) ?? null);
  AsyncStorage.setItem.mockImplementation(async (key, value) => { stored.set(key, value); });
  logout.mockResolvedValue(undefined);
  router.canGoBack.mockReturnValue(true);
});
afterEach(() => jest.restoreAllMocks());

test("admin settings exposes only the requested sections and saves preferences", async () => {
  const view = await render(<AdminSettingsScreen />, { wrapper: Wrapper });
  for (const title of ["Preferences", "Support", "Account Action"]) {
    expect(view.getByRole("header", { name: title })).toBeTruthy();
  }
  for (const excluded of ["Account", "Edit Profile", "Change Password", "Practice", "Offline Mode"]) {
    expect(view.queryByText(excluded)).toBeNull();
  }
  await fireEvent(view.getByLabelText("Dark Mode"), "valueChange", true);
  expect(view.getByTestId("current-theme").props.children).toBe("dark");
  expect(stored.get(ADMIN_DARK_MODE_KEY)).toBe("true");
  await fireEvent(view.getByLabelText("Notifications"), "valueChange", true);
  expect(stored.get(ADMIN_NOTIFICATIONS_KEY)).toBe("true");
  expect(view.getByText(/Notifications aren’t sent yet/)).toBeTruthy();
  await view.unmount();
  const reopened = await render(<AdminSettingsScreen />, { wrapper: Wrapper });
  expect(reopened.getByLabelText("Notifications").props.value).toBe(true);
});

test("saved admin theme is restored on entry and does not replace the normal-user theme", async () => {
  stored.set(ADMIN_DARK_MODE_KEY, "true");
  const view = await render(<AdminLayout />, { wrapper: Wrapper });
  expect(view.getByTestId("current-theme").props.children).toBe("dark");
  for (const name of ["(tabs)", "users/[userId]", "settings"]) expect(view.getByText(name)).toBeTruthy();
  await view.rerender(<View />);
  expect(view.getByTestId("current-theme").props.children).toBe("light");
});

test("a preference read failure does not block the admin routes", async () => {
  AsyncStorage.getItem.mockRejectedValue(new Error("Storage unavailable"));
  const view = await render(<AdminLayout />, { wrapper: Wrapper });
  expect(view.getByText("settings")).toBeTruthy();
});

test("a preference write failure is reported without losing the current theme", async () => {
  AsyncStorage.setItem.mockRejectedValue(new Error("Storage unavailable"));
  const view = await render(<AdminSettingsScreen />, { wrapper: Wrapper });
  await fireEvent(view.getByLabelText("Dark Mode"), "valueChange", true);
  expect(view.getByText(/Couldn’t save this preference/)).toBeTruthy();
  expect(view.getByTestId("current-theme").props.children).toBe("dark");
});

test.each([false, true])("support modals show the supplied content and email link (dark: %s)", async (dark) => {
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const view = await render(<AdminSettingsScreen />, { wrapper: Wrapper });
  if (dark) await fireEvent(view.getByLabelText("Dark Mode"), "valueChange", true);
  await fireEvent.press(view.getByLabelText("Help Center"));
  expect(view.getByText("Need Help?")).toBeTruthy();
  expect(view.getByText(/Have a question, experiencing an issue/)).toBeTruthy();
  await fireEvent.press(view.getByRole("link", { name: "speaksharp13@gmail.com" }));
  expect(Linking.openURL).toHaveBeenCalledWith("mailto:speaksharp13@gmail.com");
  await fireEvent.press(view.getByText("Close"));
  expect(view.queryByText("Need Help?")).toBeNull();
  await fireEvent.press(view.getByLabelText("Terms of Service"));
  const title = view.getByText("SpeakSharp — Terms of Service");
  expect(title.parent.parent.props.style.backgroundColor).toBe(dark ? "#171C26" : "#FFFFFF");
  expect(view.getByText("Last updated: 1 November 2026")).toBeTruthy();
  for (const title of ["1. About SpeakSharp", "2. Responsible Use", "3. Recordings and Data", "4. AI Feedback", "5. Account Access", "6. Changes and Availability", "7. Contact"]) {
    expect(view.getByText(title)).toBeTruthy();
  }
  expect(view.getByLabelText("Support content")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Close support"));
  expect(view.queryByText("Last updated: 1 November 2026")).toBeNull();
});

test("email-app failures leave the address available to copy", async () => {
  jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No mail app"));
  const view = await render(<AdminSettingsScreen />, { wrapper: Wrapper });
  await fireEvent.press(view.getByLabelText("Help Center"));
  await fireEvent.press(view.getByRole("link", { name: "speaksharp13@gmail.com" }));
  expect(view.getByText(/Couldn’t open an email app/)).toBeTruthy();
  expect(view.getByText("speaksharp13@gmail.com")).toBeTruthy();
});

test("Sign Out uses the existing logout and returns to sign-in; failures remain retryable", async () => {
  logout.mockRejectedValueOnce(new Error("Offline"));
  const view = await render(<AdminSettingsScreen />, { wrapper: Wrapper });
  await fireEvent.press(view.getByLabelText("Sign Out"));
  expect(view.getByText("Please try again.")).toBeTruthy();
  expect(router.replace).not.toHaveBeenCalled();
  await fireEvent.press(view.getByLabelText("Sign Out"));
  expect(logout).toHaveBeenCalledTimes(2);
  expect(router.replace).toHaveBeenCalledWith("/sign-in");
});

test("admin tabs retain their three routes and nested headers provide back navigation", async () => {
  const view = await render(<AdminTabsLayout />, { wrapper: Wrapper });
  for (const name of ["index", "users", "activity"]) expect(view.getByText(name)).toBeTruthy();
  expect(Tabs.mock.calls[0][0].backBehavior).toBe("initialRoute");
  await view.rerender(<AdminHeader title="User Details" back />);
  await fireEvent.press(view.getByLabelText("Go back"));
  expect(router.back).toHaveBeenCalledTimes(1);
  router.canGoBack.mockReturnValue(false);
  await fireEvent.press(view.getByLabelText("Go back"));
  expect(router.replace).toHaveBeenCalledWith("/admin");
});

test("admin confirmation dialogs scroll long content and keep existing actions", async () => {
  const onCancel = jest.fn();
  const onConfirm = jest.fn();
  const title = "Suspend Alexandra Ntombizodwa Long Family Name?";
  const view = await render(
    <ConfirmDialog admin visible title={title} message="They won’t be able to sign in until reactivated."
      confirmLabel="Suspend" onCancel={onCancel} onConfirm={onConfirm} />,
    { wrapper: Wrapper },
  );
  expect(view.getByText(title).props.numberOfLines).toBeUndefined();
  expect(view.getByLabelText("Confirmation details")).toBeTruthy();
  await fireEvent.press(view.getByText("Cancel"));
  await fireEvent.press(view.getByText("Suspend"));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onConfirm).toHaveBeenCalledTimes(1);
});
