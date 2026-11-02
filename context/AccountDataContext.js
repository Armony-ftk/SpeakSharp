import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "../hooks/useAuth";
import { useProgress } from "../hooks/useProgress";
import { useRecordingQueue } from "../hooks/useRecordingQueue";
import { mergeSessionEntries, removeQueuedRecording } from "../storage/recordingQueue";
import { calculateProgress, getSessionSummaries } from "../utils/progressStats";

const AccountDataContext = createContext(null);

export function AccountDataProvider({ children, enabled }) {
  const { currentUser } = useAuth();
  const uid = enabled ? currentUser?.uid ?? null : null;
  const progressData = useProgress(enabled);
  const localQueue = useRecordingQueue(uid);
  const [state, setState] = useState(null);
  const [queueAckError, setQueueAckError] = useState("");
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
  const mergedEntries = mergeSessionEntries(progressData.recordingEntries, localQueue.entries);
  useEffect(() => {
    // Keep the durable handoff until the shared listener actually has this ID.
    // Rendering already uses the remote record before acknowledgement removes it.
    const remoteIds = new Set(progressData.recordingEntries.flatMap((entry) =>
      entry.recordings.map((recording) => `${entry.data.id}/${recording.id}`)));
    for (const entry of localQueue.entries) {
      if (entry.syncStatus === "synced" && !entry.deletionPending && remoteIds.has(`${entry.sessionId}/${entry.recordingId}`)) {
        void removeQueuedRecording(uid, entry.recordingId, { onlySynced: true }).then(() => setQueueAckError("")).catch(() => {
          setQueueAckError("Upload succeeded, but local sync information could not be cleared. Your audio is retained. Reopen the app to retry.");
        });
      }
    }
  }, [uid, localQueue.entries, progressData.recordingEntries]);
  const hasLocal = localQueue.entries.length > 0;
  const value = {
    ...progressData,
    recordingEntries: mergedEntries,
    ...(hasLocal ? { sessions: getSessionSummaries(mergedEntries),
      progress: calculateProgress(mergedEntries.length, mergedEntries.flatMap((entry) => entry.recordings)),
      loading: false } : {}),
    pendingRecordings: localQueue.entries,
    networkOnline: localQueue.online,
    localQueueError: localQueue.errorMessage || queueAckError,
    uid,
    profile: current?.profile ?? null,
    profileLoading: Boolean(uid && !current && !hasLocal),
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
