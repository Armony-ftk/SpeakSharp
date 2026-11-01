const React = require("react");
const { render, fireEvent, act } = require("@testing-library/react-native");
jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn() } }));
jest.mock("../../services/authService", () => ({ logout: jest.fn(), getAuthErrorMessage: () => "Sign out failed" }));
jest.mock("../../services/accountDeletionService", () => ({ deleteOwnAccount: jest.fn(), getAccountDeletionError: () => "Incorrect password. Please try again." }));
jest.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ role: "user" }) }));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
const { ThemeProvider } = require("../../constants/ThemeContext");
const { deleteOwnAccount } = require("../../services/accountDeletionService");
const SettingsScreen = require("./SettingsScreen").default;
const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => jest.clearAllMocks());

test("confirmation warns about permanent deletion; Cancel clears the password and performs no deletion", async () => {
  const view = await render(<SettingsScreen />, { wrapper });
  await fireEvent.press(view.getByText("Delete Account"));
  expect(view.getByText("Delete your account?")).toBeTruthy();
  expect(view.getByText(/This will permanently delete/)).toBeTruthy();
  const field = view.getByLabelText("Current password");
  await fireEvent.changeText(field, "current-password");
  expect(field.props.secureTextEntry).toBe(true);
  await fireEvent.press(view.getByText("Cancel"));
  expect(deleteOwnAccount).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText("Delete Account"));
  expect(view.getByLabelText("Current password").props.value).toBe("");
});

test("duplicate destructive taps submit once and show loading; wrong password leaves a retryable modal", async () => {
  let reject;
  deleteOwnAccount.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
  const view = await render(<SettingsScreen />, { wrapper });
  await fireEvent.press(view.getByText("Delete Account"));
  await fireEvent.changeText(view.getByLabelText("Current password"), "wrong");
  const confirm = view.getAllByText("Delete Account").at(-1);
  await act(async () => { fireEvent.press(confirm); fireEvent.press(confirm); });
  expect(deleteOwnAccount).toHaveBeenCalledTimes(1);
  expect(view.getByText("Deleting your account...")).toBeTruthy();
  expect(view.getByLabelText("Current password").props.value).toBe("");
  await act(async () => reject({ code: "auth/invalid-credential" }));
  expect(view.getByText("Incorrect password. Please try again.")).toBeTruthy();
  expect(view.getByText("Delete your account?")).toBeTruthy();
});
