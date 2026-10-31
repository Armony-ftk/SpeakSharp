const React = require("react");
const { act, renderHook } = require("@testing-library/react-native");
const { AuthProvider } = require("./AuthContext");
const { useAuth } = require("../hooks/useAuth");
const { observeAuthState, refreshEmailVerification } = require("../services/authService");

jest.mock("../services/authService", () => ({
  observeAuthState: jest.fn(),
  refreshEmailVerification: jest.fn(),
}));

let emitAuth;
let unsubscribe;
beforeEach(() => {
  jest.clearAllMocks();
  unsubscribe = jest.fn();
  observeAuthState.mockImplementation((callback) => {
    emitAuth = callback;
    return unsubscribe;
  });
});

const wrapper = ({ children }) => React.createElement(AuthProvider, null, children);
const user = (uid, claims = {}, emailVerified = true) => ({
  uid, emailVerified,
  getIdTokenResult: jest.fn().mockResolvedValue({ claims }),
});

test("one auth observer preserves verification and requires an explicit admin claim", async () => {
  const view = await renderHook(useAuth, { wrapper });
  const unverified = user("unverified", { admin: true }, false);
  await act(async () => emitAuth(unverified));
  expect(view.result.current.role).toBe("unverified");
  expect(unverified.getIdTokenResult).not.toHaveBeenCalled();
  await act(async () => emitAuth(user("ordinary", { admin: "true" })));
  expect(view.result.current.role).toBe("user");
  await act(async () => emitAuth(user("admin", { admin: true })));
  expect(view.result.current.role).toBe("admin");
  expect(observeAuthState).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(unsubscribe).toHaveBeenCalledTimes(1);
});

test("late claims cannot restore admin access after account switching or logout", async () => {
  const view = await renderHook(useAuth, { wrapper });
  let finishClaims;
  const admin = user("admin");
  admin.getIdTokenResult.mockImplementation(() => new Promise((resolve) => { finishClaims = resolve; }));
  await act(async () => emitAuth(admin));
  await act(async () => emitAuth(user("ordinary")));
  await act(async () => finishClaims({ claims: { admin: true } }));
  expect(view.result.current.currentUser.uid).toBe("ordinary");
  expect(view.result.current.role).toBe("user");
  await act(async () => emitAuth(admin));
  await act(async () => emitAuth(null));
  await act(async () => finishClaims({ claims: { admin: true } }));
  expect(view.result.current.currentUser).toBeNull();
  expect(view.result.current.role).toBe("guest");
  expect(view.result.current.roleLoading).toBe(false);
  await view.unmount();
});

test("failed claim checks keep normal access and deny administrator access", async () => {
  const view = await renderHook(useAuth, { wrapper });
  const account = user("offline");
  account.getIdTokenResult.mockRejectedValue(new Error("offline"));
  await act(async () => emitAuth(account));
  expect(view.result.current.isEmailVerified).toBe(true);
  expect(view.result.current.role).toBe("user");
  expect(view.result.current.roleLoading).toBe(false);
  await view.unmount();
});

test("a late email-verification refresh cannot restore a logged-out account", async () => {
  const view = await renderHook(useAuth, { wrapper });
  const account = user("ordinary");
  await act(async () => emitAuth(account));
  let finishRefresh;
  refreshEmailVerification.mockImplementation(() => new Promise((resolve) => { finishRefresh = resolve; }));
  const pending = view.result.current.refreshUser();
  const rejected = expect(pending).rejects.toThrow("auth/stale-user");
  await act(async () => emitAuth(null));
  await act(async () => finishRefresh(account));
  await rejected;
  expect(view.result.current.currentUser).toBeNull();
  expect(view.result.current.role).toBe("guest");
  await view.unmount();
});
