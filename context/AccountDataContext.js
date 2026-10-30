import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { useProgress } from "../hooks/useProgress";

const AccountDataContext = createContext(null);

export function AccountDataProvider({ children, enabled }) {
  const { currentUser } = useAuth();
  const uid = enabled ? currentUser?.uid ?? null : null;
  const progressData = useProgress(enabled);
  const [state, setState] = useState(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const retryProfile = useCallback(() => setRetryVersion((version) => version + 1), []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    let unsubscribe;
    const fail = () => {
      if (!active) return;
      active = false;
      unsubscribe?.();
      setState({ uid, retryVersion, profile: null,
        errorMessage: "Could not load your profile. Check your connection and try again." });
    };
    try {
      unsubscribe = onSnapshot(doc(db, "users", uid), (snapshot) => {
        if (!active) return;
        setState({ uid, retryVersion, profile: snapshot.exists() ? snapshot.data() : null, errorMessage: "" });
      }, fail);
    } catch {
      fail();
    }
    return () => {
      if (active) unsubscribe?.();
      active = false;
    };
  }, [uid, retryVersion]);

  // Mask old account/retry data during render, before listener cleanup runs.
  const current = uid && state?.uid === uid && state.retryVersion === retryVersion ? state : null;
  const value = {
    ...progressData,
    uid,
    profile: current?.profile ?? null,
    profileLoading: Boolean(uid && !current),
    profileErrorMessage: current?.errorMessage ?? "",
    retryProfile,
  };
  return <AccountDataContext.Provider value={value}>{children}</AccountDataContext.Provider>;
}

export function useAccountData() {
  const value = useContext(AccountDataContext);
  if (!value) throw new Error("useAccountData must be used within an AccountDataProvider");
  return value;
}
