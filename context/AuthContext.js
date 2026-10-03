import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  observeAuthState,
  refreshEmailVerification,
} from "../services/authService";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    return observeAuthState(
      (user) => {
        setCurrentUser(user);
        setIsEmailVerified(Boolean(user?.emailVerified));
        setInitializing(false);
      },
      (error) => {
        if (__DEV__) {
          console.warn("Could not restore Firebase authentication state", error);
        }
        setCurrentUser(null);
        setIsEmailVerified(false);
        setInitializing(false);
      },
    );
  }, []);

  const refreshUser = useCallback(async () => {
    const user = await refreshEmailVerification(currentUser);
    setCurrentUser(user);
    setIsEmailVerified(user.emailVerified);
    return user;
  }, [currentUser]);

  const value = useMemo(
    () => ({
      currentUser,
      initializing,
      isAuthenticated: Boolean(currentUser),
      isEmailVerified,
      refreshUser,
    }),
    [currentUser, initializing, isEmailVerified, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
