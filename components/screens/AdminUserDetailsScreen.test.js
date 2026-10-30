const React = require("react");
const {
  act,
  fireEvent,
  render,
  waitFor,
} = require("@testing-library/react-native");

const storageData = new Map();

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

jest.mock("../../services/adminService", () => ({
  getUserDetails: jest.fn(),
  setUserDisabled: jest.fn(),
}));

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

jest.mock("../../constants/ThemeContext", () => ({
  useAppTheme: () => ({
    colors: {
      accent: "#00AEEF",
      card: "#FFFFFF",
      cardBorder: "#D0D5DD",
      inputBackground: "#F2F4F7",
      navy: "#101828",
      navySoft: "#475467",
      success: "#027A48",
      textPrimary: "#101828",
    },
    typography: { body: {}, heading: {} },
  }),
}));

jest.mock("../../constants/theme", () => ({
  radius: { md: 8, pill: 999 },
  spacing: { xs: 4, sm: 8, smd: 12, md: 16 },
}));

jest.mock("../admin/ActivityRow", () => () => null);
jest.mock("../admin/StatusBadge", () => () => null);
jest.mock("../ui/EmptyState", () => ({ title, actionLabel, onAction }) => {
  const MockReact = require("react");
  const { Pressable, Text, View } = require("react-native");
  return MockReact.createElement(
    View,
    null,
    MockReact.createElement(Text, null, title),
    actionLabel
      ? MockReact.createElement(
          Pressable,
          { accessibilityRole: "button", onPress: onAction },
          MockReact.createElement(Text, null, actionLabel),
        )
      : null,
  );
});
jest.mock("../ui/PrimaryButton", () => ({ label, onPress }) => {
  const MockReact = require("react");
  const { Pressable, Text } = require("react-native");
  return MockReact.createElement(
    Pressable,
    { accessibilityRole: "button", onPress },
    MockReact.createElement(Text, null, label),
  );
});
jest.mock("../ui/ScreenContainer", () => ({ children }) => {
  const MockReact = require("react");
  const { View } = require("react-native");
  return MockReact.createElement(View, null, children);
});
jest.mock("../ui/StatCard", () => ({ label, value }) => {
  const MockReact = require("react");
  const { Text, View } = require("react-native");
  return MockReact.createElement(
    View,
    null,
    MockReact.createElement(Text, null, label),
    MockReact.createElement(Text, null, value),
  );
});
jest.mock("../ui/ConfirmDialog", () => ({
  visible,
  onCancel,
  onConfirm,
  loading,
}) => {
  const MockReact = require("react");
  const { Pressable, Text, View } = require("react-native");
  if (!visible) return null;
  return MockReact.createElement(
    View,
    { testID: "confirm-dialog" },
    MockReact.createElement(
      Pressable,
      { accessibilityRole: "button", onPress: onCancel },
      MockReact.createElement(Text, null, "Cancel"),
    ),
    MockReact.createElement(
      Pressable,
      {
        accessibilityRole: "button",
        accessibilityLabel: "Confirm account change",
        disabled: loading,
        onPress: onConfirm,
      },
      MockReact.createElement(
        Text,
        { testID: "confirm-account-change", onPress: onConfirm },
        "Confirm",
      ),
    ),
  );
});
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));

const AsyncStorage = require("@react-native-async-storage/async-storage").default;
const { getUserDetails, setUserDisabled } = require("../../services/adminService");
const AdminUserDetailsScreen = require("./AdminUserDetailsScreen").default;
let currentView;
const screen = {
  getByLabelText: (...args) => currentView.getByLabelText(...args),
  getByTestId: (...args) => currentView.getByTestId(...args),
  getByText: (...args) => currentView.getByText(...args),
  queryByText: (...args) => currentView.queryByText(...args),
};

const activeUser = {
  userId: "user-1",
  fullName: "Test User",
  email: "test@example.com",
  accountStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  totalSessions: 1,
  totalRecordings: null,
  recentActivity: [],
};

const suspendedUser = { ...activeUser, accountStatus: "suspended" };

async function renderDetails(user = activeUser, userId = user.userId) {
  getUserDetails.mockResolvedValue(user);
  currentView = await render(React.createElement(AdminUserDetailsScreen, { userId }));
  return currentView;
}

async function openAccountConfirmation() {
  await waitFor(() =>
    expect(screen.getByLabelText(/Suspend Account|Reactivate Account/)).toBeTruthy(),
  );
  await act(async () => {
    await fireEvent.press(screen.getByLabelText(/Suspend Account|Reactivate Account/));
  });
  await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeTruthy());
}

async function confirmAccountChange() {
  await act(async () => {
    const button = screen.getByTestId("confirm-account-change");
    await (button.props.onPress ?? button.parent.props.onPress)();
  });
}

beforeEach(() => {
  storageData.clear();
  jest.clearAllMocks();
  AsyncStorage.getItem.mockImplementation(async (key) => storageData.get(key) ?? null);
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    storageData.set(key, value);
  });
  AsyncStorage.removeItem.mockImplementation(async (key) => {
    storageData.delete(key);
  });
  getUserDetails.mockResolvedValue(activeUser);
  setUserDisabled.mockResolvedValue({
    userId: activeUser.userId,
    accountStatus: "suspended",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
});

afterEach(() => jest.useRealTimers());

test("persists a new operation before calling the backend", async () => {
  const order = [];
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    order.push("save");
    storageData.set(key, value);
  });
  setUserDisabled.mockImplementation(async () => {
    order.push("call");
    return { userId: activeUser.userId, accountStatus: "suspended" };
  });

  await renderDetails();
  await openAccountConfirmation();
  await confirmAccountChange();

  await waitFor(() => expect(setUserDisabled).toHaveBeenCalledTimes(1));
  expect(order).toEqual(["save", "call"]);
  expect(setUserDisabled.mock.calls[0][2]).toMatch(/^op_[0-9a-f]{8}-/i);
});

test("clears a completed operation before creating a new operation ID", async () => {
  const timeline = [];
  const operationKey = "speaksharp:account-status-operation:user-1";
  AsyncStorage.setItem.mockImplementation(async (key, value) => {
    timeline.push("save");
    storageData.set(key, value);
  });
  AsyncStorage.removeItem.mockImplementation(async (key) => {
    timeline.push("clear");
    storageData.delete(key);
  });
  setUserDisabled.mockImplementation(async (userId, disabled, operationId) => {
    timeline.push("call");
    return {
      userId,
      accountStatus: disabled ? "suspended" : "active",
      updatedAt: "2026-01-01T00:00:00.000Z",
      operationId,
    };
  });

  await renderDetails();
  await openAccountConfirmation();
  await confirmAccountChange();

  await waitFor(() => expect(setUserDisabled).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(1));
  expect(storageData.has(operationKey)).toBe(false);
  const firstOperationId = setUserDisabled.mock.calls[0][2];
  expect(firstOperationId).toMatch(/^op_[0-9a-f]{8}-/i);
  expect(timeline).toEqual(["save", "call", "clear"]);

  await waitFor(() => expect(screen.getByLabelText("Reactivate Account")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Reactivate Account"));
  await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeTruthy());
  await confirmAccountChange();

  await waitFor(() => expect(setUserDisabled).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(AsyncStorage.removeItem).toHaveBeenCalledTimes(2));
  const secondOperationId = setUserDisabled.mock.calls[1][2];
  expect(secondOperationId).toMatch(/^op_[0-9a-f]{8}-/i);
  expect(secondOperationId).not.toBe(firstOperationId);
  expect(timeline).toEqual(["save", "call", "clear", "save", "call", "clear"]);
  expect(storageData.has(operationKey)).toBe(false);
});

test("reuses the same operation ID after remounting an unresolved request", async () => {
  setUserDisabled.mockRejectedValueOnce({ code: "unavailable" }).mockResolvedValueOnce({
    userId: activeUser.userId,
    accountStatus: "suspended",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  const first = await renderDetails();
  await openAccountConfirmation();
  await confirmAccountChange();
  await waitFor(() => expect(setUserDisabled).toHaveBeenCalledTimes(1));
  const firstOperationId = setUserDisabled.mock.calls[0][2];
  await first.unmount();

  await renderDetails();
  await openAccountConfirmation();
  await confirmAccountChange();

  await waitFor(() => expect(setUserDisabled).toHaveBeenCalledTimes(2));
  expect(setUserDisabled.mock.calls[1][2]).toBe(firstOperationId);
});

test("passes an operation ID for reactivation", async () => {
  setUserDisabled.mockResolvedValue({
    userId: suspendedUser.userId,
    accountStatus: "active",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await renderDetails(suspendedUser);
  await openAccountConfirmation();
  await confirmAccountChange();

  await waitFor(() => expect(setUserDisabled).toHaveBeenCalledTimes(1));
  expect(setUserDisabled.mock.calls[0][0]).toBe(suspendedUser.userId);
  expect(setUserDisabled.mock.calls[0][1]).toBe(false);
  expect(setUserDisabled.mock.calls[0][2]).toMatch(/^op_[0-9a-f]{8}-/i);
});

test("rejects a conflicting state change without replacing the unresolved attempt", async () => {
  const stored = {
    operationId: "op_123e4567-e89b-42d3-a456-426614174000",
    userId: activeUser.userId,
    requestedDisabled: false,
  };
  storageData.set(
    "speaksharp:account-status-operation:user-1",
    JSON.stringify(stored),
  );

  await renderDetails();
  await waitFor(() => expect(screen.getByLabelText("Suspend Account")).toBeTruthy());
  fireEvent.press(screen.getByLabelText("Suspend Account"));
  await waitFor(() => expect(screen.getByTestId("confirm-dialog")).toBeTruthy());
  await confirmAccountChange();

  await waitFor(() => expect(screen.getByText(/Trusted recovery is required/)).toBeTruthy());
  expect(setUserDisabled).not.toHaveBeenCalled();
  expect(JSON.parse(storageData.get("speaksharp:account-status-operation:user-1"))).toEqual(stored);
});

test("fails closed when the pending operation cannot be read", async () => {
  AsyncStorage.getItem.mockRejectedValue(new Error("storage unavailable"));
  await renderDetails();

  await waitFor(() =>
    expect(screen.getByText(/pending account operation could not be loaded/)).toBeTruthy(),
  );
  expect(setUserDisabled).not.toHaveBeenCalled();
});

test("does not call the backend when saving a new operation fails", async () => {
  AsyncStorage.setItem.mockRejectedValue(new Error("storage unavailable"));
  await renderDetails();
  await openAccountConfirmation();
  await confirmAccountChange();

  await waitFor(() => expect(screen.getByText(/Could not save the account operation/)).toBeTruthy());
  expect(setUserDisabled).not.toHaveBeenCalled();
});

test("keeps success confirmed when clearing the retry record fails", async () => {
  AsyncStorage.removeItem.mockRejectedValue(new Error("storage unavailable"));
  await renderDetails();
  await openAccountConfirmation();
  await confirmAccountChange();

  await waitFor(() => expect(screen.getByText("Account suspended.")).toBeTruthy());
  expect(screen.getByText(/updated successfully/)).toBeTruthy();
});

test("ignores rapid duplicate taps while one request is pending", async () => {
  let resolveCall;
  setUserDisabled.mockReturnValue(new Promise((resolve) => {
    resolveCall = resolve;
  }));
  await renderDetails();
  await openAccountConfirmation();

  await act(async () => {
    const confirmButton = screen.getByTestId("confirm-account-change");
    const onPress = confirmButton.props.onPress ?? confirmButton.parent.props.onPress;
    const firstPress = onPress();
    const secondPress = onPress();
    await Promise.resolve();
    await Promise.resolve();
    expect(setUserDisabled).toHaveBeenCalledTimes(1);
    resolveCall({
      userId: activeUser.userId,
      accountStatus: "suspended",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await Promise.all([firstPress, secondPress]);
  });
  expect(setUserDisabled).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByText("Account suspended.")).toBeTruthy());
});

test("ignores stale responses after changing users", async () => {
  let resolveFirst;
  let resolveSecond;
  getUserDetails.mockImplementation((requestedUserId) => {
    if (requestedUserId === "user-1") {
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    }
    return new Promise((resolve) => {
      resolveSecond = resolve;
    });
  });

  const view = (currentView = await render(
    React.createElement(AdminUserDetailsScreen, { userId: "user-1" }),
  ));
  await view.rerender(React.createElement(AdminUserDetailsScreen, { userId: "user-2" }));
  resolveSecond({ ...activeUser, userId: "user-2", fullName: "Second User" });
  await waitFor(() => expect(screen.getByText("Second User")).toBeTruthy());
  resolveFirst({ ...activeUser, userId: "user-1", fullName: "First User" });
  await Promise.resolve();

  expect(screen.queryByText("First User")).toBeNull();
  expect(screen.getByText("Second User")).toBeTruthy();
});
