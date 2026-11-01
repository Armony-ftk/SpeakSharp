const React = require("react");
const { Text } = require("react-native");
const { render, fireEvent, act } = require("@testing-library/react-native");
let mockUser = { uid: "alice" };
jest.mock("@react-native-async-storage/async-storage", () => ({ __esModule: true, default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}) } }));
jest.mock("../hooks/useAuth", () => ({ useAuth: () => ({ currentUser: mockUser }) }));
jest.mock("../services/accountDeletionService", () => ({
  accountDeletionRunning: () => false,
  confirmAccountDeletion: jest.fn(async () => { throw new Error("unconfirmed"); }),
  deleteOwnAccount: jest.fn(),
  getAccountDeletionError: () => "Resume deletion to check again.",
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: require("react-native").View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
const { ThemeProvider } = require("../constants/ThemeContext");
const { saveAccountDeletion, forgetAccountDeletion, getAccountDeletions } = require("../storage/accountDeletionState");
const service = require("../services/accountDeletionService");
const Gate = require("./AccountDeletionGate").default;
const wrapper = ({ children }) => <ThemeProvider>{children}</ThemeProvider>;
beforeEach(() => { jest.clearAllMocks(); mockUser = { uid: "alice" }; });
afterEach(async () => { for (const uid of Object.keys(getAccountDeletions())) await forgetAccountDeletion(uid); });

test("deletion unmounts account screens and active recording effects; resume survives Auth removal and returns to existing routes", async () => {
  let stopped = 0;
  function ActiveScreen() {
    React.useEffect(() => () => { stopped++; }, []);
    return <Text>Account screens</Text>;
  }
  const view = await render(<Gate><ActiveScreen /></Gate>, { wrapper });
  expect(await view.findByText("Account screens")).toBeTruthy();
  await act(async () => saveAccountDeletion("alice", { receipt: "ab".repeat(32), phase: "submitted" }));
  expect(stopped).toBe(1); expect(view.queryByText("Account screens")).toBeNull();
  expect(await view.findByText("Resume deletion to check again.")).toBeTruthy();
  await fireEvent.changeText(view.getByLabelText("Current password"), "password");
  service.deleteOwnAccount.mockImplementation(async () => {
    await saveAccountDeletion("alice", { receipt: "ab".repeat(32), phase: "confirmed" });
    mockUser = null;
    await forgetAccountDeletion("alice");
  });
  await fireEvent.press(view.getByText("Resume deletion"));
  expect(service.deleteOwnAccount).toHaveBeenCalledWith("password", "alice");
  expect(await view.findByText("Account screens")).toBeTruthy();
});

test("another account's pending deletion does not replace the current account's screens", async () => {
  await saveAccountDeletion("bob", { receipt: "cd".repeat(32), phase: "submitted" });
  const view = await render(<Gate><Text>Alice screens</Text></Gate>, { wrapper });
  expect(await view.findByText("Alice screens")).toBeTruthy();
  expect(service.confirmAccountDeletion).not.toHaveBeenCalled();
});
