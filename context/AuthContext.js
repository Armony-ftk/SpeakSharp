import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  observeAuthState,
  refreshEmailVerification,
} from "../services/authService";

const ROLE_CHECK_TIMEOUT_MS = 5000;

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [role, setRole] = useState("guest");
  const [roleLoading, setRoleLoading] = useState(false);

  const roleRequestRef = useRef(0);
  const authUserRef = useRef(null);
  const authGenerationRef = useRef(0);

  const resolveRole = useCallback(async (user) => {
    const requestId = roleRequestRef.current + 1;
    roleRequestRef.current = requestId;

    const isCurrentRequest = () =>
      roleRequestRef.current === requestId;

    if (!user) {
      setRole("guest");
      setRoleLoading(false);
      return "guest";
    }

    if (!user.emailVerified) {
      setRole("unverified");
      setRoleLoading(false);
      return "unverified";
    }

    // Preserve ordinary-user access while the claim is checked.
    setRole("user");
    setRoleLoading(true);

    let timeoutId;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const error = new Error("auth/role-check-timeout");
          error.code = "auth/role-check-timeout";
          reject(error);
        }, ROLE_CHECK_TIMEOUT_MS);
      });

      const tokenResult = await Promise.race([
        user.getIdTokenResult(true),
        timeoutPromise,
      ]);

      if (!isCurrentRequest()) {
        return null;
      }

      const resolvedRole =
        tokenResult.claims?.admin === true ? "admin" : "user";

      setRole(resolvedRole);
      return resolvedRole;
    } catch (error) {
      if (!isCurrentRequest()) {
        return null;
      }

      if (error?.code === "auth/role-check-timeout") {
        setRole("user");
        setRoleLoading(false);

        // Invalidate the timed-out request so a late token response is ignored.
        roleRequestRef.current += 1;
        throw error;
      }

      // Authentication remains usable, but administration fails closed.
      setRole("user");
      throw error;
    } finally {
      clearTimeout(timeoutId);

      // A stale request must not clear a newer request's loading state.
      if (isCurrentRequest()) {
        setRoleLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const handleAuthState = (user) => {
      if (!active) {
        return;
      }

      authGenerationRef.current += 1;
      authUserRef.current = user;

      setCurrentUser(user);
      setIsEmailVerified(Boolean(user?.emailVerified));
      setInitializing(false);

      if (!user) {
        roleRequestRef.current += 1;
        setRole("guest");
        setRoleLoading(false);
        return;
      }

      if (!user.emailVerified) {
        roleRequestRef.current += 1;
        setRole("unverified");
        setRoleLoading(false);
        return;
      }

      setRole("user");
      setRoleLoading(true);

      // Authentication restoration is complete. A failed role check must
      // not block ordinary authenticated screens.
      resolveRole(user).catch(() => {});
    };

    const unsubscribe = observeAuthState(
      handleAuthState,
      (error) => {
        if (__DEV__) {
          console.warn(
            "Could not restore Firebase authentication state",
            error,
          );
        }

        authGenerationRef.current += 1;
        authUserRef.current = null;
        roleRequestRef.current += 1;

        setCurrentUser(null);
        setIsEmailVerified(false);
        setRole("guest");
        setRoleLoading(false);
        setInitializing(false);
      },
    );

    return () => {
      active = false;
      authGenerationRef.current += 1;
      authUserRef.current = null;
      roleRequestRef.current += 1;
      unsubscribe();
    };
  }, [resolveRole]);

  const refreshUser = useCallback(async () => {
    const userAtStart = authUserRef.current;
    const generationAtStart = authGenerationRef.current;
    const uidAtStart = userAtStart?.uid;

    const refreshedUser = await refreshEmailVerification(userAtStart);

    const authStateIsCurrent =
      authGenerationRef.current === generationAtStart &&
      authUserRef.current?.uid === uidAtStart &&
      refreshedUser?.uid === uidAtStart;

    if (!authStateIsCurrent) {
      throw new Error("auth/stale-user");
    }

    setCurrentUser(refreshedUser);
    setIsEmailVerified(Boolean(refreshedUser.emailVerified));

    await resolveRole(refreshedUser).catch(() => {});

    const roleCheckIsCurrent =
      authGenerationRef.current === generationAtStart &&
      authUserRef.current?.uid === uidAtStart;

    if (!roleCheckIsCurrent) {
      throw new Error("auth/stale-user");
    }

    return refreshedUser;
  }, [resolveRole]);

  const refreshRole = useCallback(
    () => resolveRole(authUserRef.current),
    [resolveRole],
  );

  const value = useMemo(
    () => ({
      currentUser,
      initializing,
      isAuthenticated: Boolean(currentUser),
      isEmailVerified,
      role,
      roleLoading,
      refreshUser,
      refreshRole,
    }),
    [
      currentUser,
      initializing,
      isEmailVerified,
      role,
      roleLoading,
      refreshUser,
      refreshRole,
    ],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
