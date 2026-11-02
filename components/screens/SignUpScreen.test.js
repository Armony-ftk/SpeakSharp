const React = require("react");
const { render, fireEvent } = require("@testing-library/react-native");

jest.mock("../../services/authService", () => ({
  registerWithEmail: jest.fn(), loginWithEmail: jest.fn(),
  sendVerificationEmail: jest.fn(), getAuthErrorMessage: () => "Please try again.",
}));
jest.mock("../../services/profileService", () => ({ createUserProfile: jest.fn() }));
jest.mock("../../constants/ThemeContext", () => ({
  useAppTheme: () => ({ colors: require("../../constants/theme").lightColors, typography: {} }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("../ui/AuthLayout", () => ({ children }) =>
  require("react").createElement(require("react-native").View, null, children));
jest.mock("../ui/BrandTitle", () => () => null);
jest.mock("expo-router", () => ({
  Link: ({ children }) => require("react").createElement(require("react-native").Text, null, children),
  router: { replace: jest.fn(), push: jest.fn() },
}));

const { registerWithEmail, loginWithEmail, sendVerificationEmail } = require("../../services/authService");
const { createUserProfile } = require("../../services/profileService");
const { router } = require("expo-router");
const SignUpScreen = require("./SignUpScreen").default;
const SignInScreen = require("./SignInScreen").default;
const passwordPlaceholder = "\u2022".repeat(8);
const createButton = (view) => view.getByText(/^CREATE ACCOUNT/);

beforeEach(() => {
  jest.clearAllMocks();
  registerWithEmail.mockResolvedValue({ user: { uid: "new-user" } });
  createUserProfile.mockResolvedValue();
  sendVerificationEmail.mockResolvedValue();
  loginWithEmail.mockResolvedValue();
});

async function fillRegistration(view, password, confirmation = password) {
  await fireEvent.changeText(view.getByPlaceholderText("Aubrey Drake Graham"), "Test User");
  await fireEvent.changeText(view.getByPlaceholderText("drizzy@ovo.com"), "test@example.com");
  const [passwordField, confirmationField] = view.getAllByPlaceholderText(passwordPlaceholder);
  await fireEvent.changeText(passwordField, password);
  await fireEvent.changeText(confirmationField, confirmation);
  await fireEvent.press(view.getByText(/I agree to the/));
}

test("empty password explains every missing requirement and disables submission", async () => {
  const view = await render(<SignUpScreen />);
  expect(view.getByText("Password needs at least 8 characters, an uppercase letter, a lowercase letter, a number, a special character.")).toBeTruthy();
  expect(createButton(view)).toBeDisabled();
});

test.each([
  ["Aa1!bcd", "at least 8 characters"],
  ["abcdef1!", "an uppercase letter"],
  ["ABCDEF1!", "a lowercase letter"],
  ["Abcdefg!", "a number"],
  ["Abcdef12", "a special character"],
  ["Abcdef1 ", "a special character"],
])("weak password %s shows its missing requirement and cannot register", async (password, missing) => {
  const view = await render(<SignUpScreen />);
  await fillRegistration(view, password);
  expect(view.getByText(`Password needs ${missing}.`)).toBeTruthy();
  expect(createButton(view)).toBeDisabled();
  await fireEvent.press(createButton(view));
  expect(registerWithEmail).not.toHaveBeenCalled();
});

test.each(["Aa1!bcde", " Aa1_bcd "])("valid password %s registers unchanged and preserves verification", async (password) => {
  const view = await render(<SignUpScreen />);
  await fillRegistration(view, password);
  expect(createButton(view)).not.toBeDisabled();
  expect(view.queryByText(/^Password needs/)).toBeNull();
  await fireEvent.press(createButton(view));
  expect(registerWithEmail).toHaveBeenCalledWith("test@example.com", password);
  expect(createUserProfile).toHaveBeenCalledWith("new-user", { fullName: "Test User", email: "test@example.com" });
  expect(sendVerificationEmail).toHaveBeenCalledWith({ uid: "new-user" });
  expect(router.replace).toHaveBeenCalledWith({ pathname: "/verify-email", params: {} });
});

test("confirmation must match exactly, including spaces, and can be corrected", async () => {
  const view = await render(<SignUpScreen />);
  await fillRegistration(view, "Aa1!bcde", "Aa1!bcde ");
  await fireEvent.press(createButton(view));
  expect(view.getByText("Passwords do not match.")).toBeTruthy();
  expect(registerWithEmail).not.toHaveBeenCalled();
  await fireEvent.changeText(view.getAllByPlaceholderText(passwordPlaceholder)[1], "Aa1!bcde");
  await fireEvent.press(createButton(view));
  expect(registerWithEmail).toHaveBeenCalledWith("test@example.com", "Aa1!bcde");
});

test("existing users can still submit a weak password on the unchanged login screen", async () => {
  const view = await render(<SignInScreen />);
  await fireEvent.changeText(view.getByPlaceholderText("you@example.com"), "test@example.com");
  await fireEvent.changeText(view.getByPlaceholderText(passwordPlaceholder), "weak");
  await fireEvent.press(view.getByText("SIGN IN"));
  expect(loginWithEmail).toHaveBeenCalledWith("test@example.com", "weak");
});
