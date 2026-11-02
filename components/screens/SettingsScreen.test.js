const React = require("react");
const { render, fireEvent, act } = require("@testing-library/react-native");
const { Linking } = require("react-native");
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
afterEach(() => jest.restoreAllMocks());

test("regular Settings opens the shared Help and Terms content, email link and both close actions", async () => {
  jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  const view = await render(<SettingsScreen />, { wrapper });
  await fireEvent.press(view.getByText("Help Center"));
  expect(view.getByText("Need Help?")).toBeTruthy();
  expect(view.getByText(/Have a question, experiencing an issue/)).toBeTruthy();
  await fireEvent.press(view.getByRole("link", { name: "speaksharp13@gmail.com" }));
  expect(Linking.openURL).toHaveBeenCalledWith("mailto:speaksharp13@gmail.com");
  await fireEvent.press(view.getByText("Close"));
  expect(view.queryByText("Need Help?")).toBeNull();

  await fireEvent.press(view.getByText("Terms of Service"));
  expect(view.getByText("SpeakSharp — Terms of Service")).toBeTruthy();
  expect(view.getByText("Last updated: 1 November 2026")).toBeTruthy();
  expect(view.getByText("1. About SpeakSharp")).toBeTruthy();
  expect(view.getByText("7. Contact")).toBeTruthy();
  expect(view.getByLabelText("Support content")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Close support"));
  expect(view.queryByText("Last updated: 1 November 2026")).toBeNull();
});

test("shared email failure retains the address and resets when support is reopened", async () => {
  jest.spyOn(Linking, "openURL").mockRejectedValue(new Error("No mail app"));
  const view = await render(<SettingsScreen />, { wrapper });
  await fireEvent.press(view.getByText("Help Center"));
  await fireEvent.press(view.getByRole("link", { name: "speaksharp13@gmail.com" }));
  expect(view.getByText(/Couldn’t open an email app/)).toBeTruthy();
  expect(view.getByText("speaksharp13@gmail.com")).toBeTruthy();
  await fireEvent.press(view.getByText("Close"));
  await fireEvent.press(view.getByText("Terms of Service"));
  expect(view.queryByText(/Couldn’t open an email app/)).toBeNull();
});

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
