import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../config/firebase";
import { useAuth } from "./useAuth";
import { calculateProgress } from "../utils/progressStats";

const EMPTY_PROGRESS = calculateProgress(0, []);

export function useProgress() {
  const { currentUser, initializing } = useAuth();
  const uid = currentUser?.uid ?? null;
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, setState] = useState(null);
  const retry = useCallback(() => setRetryVersion((version) => version + 1), []);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    let unsubscribeSessions;
    const sessions = new Map();
    setState({ uid, retryVersion, loading: true, errorMessage: "", progress: EMPTY_PROGRESS });

    function cleanup() {
      if (!active) return;
      active = false;
      unsubscribeSessions?.();
      for (const session of sessions.values()) session.unsubscribe?.();
      sessions.clear();
    }

    function fail(error) {
      if (!active) return;
      cleanup();
      setState({ uid, retryVersion, loading: false, progress: EMPTY_PROGRESS,
        errorMessage: error?.code === "permission-denied"
          ? "Unable to access your progress. Please sign in again or try again."
          : "Could not load your progress. Check your connection and try again." });
    }

    function publish() {
      if (!active) return;
      const entries = [...sessions.values()];
      if (entries.some((session) => session.recordings === null)) {
        setState((previous) => previous?.uid === uid && previous.retryVersion === retryVersion && previous.loading
          ? previous : { uid, retryVersion, loading: true, errorMessage: "", progress: EMPTY_PROGRESS });
        return;
      }
      setState({ uid, retryVersion, loading: false, errorMessage: "",
        progress: calculateProgress(sessions.size, entries.flatMap((session) => session.recordings)) });
    }

    try {
      // Unordered collection reads also include documents missing createdAt.
      unsubscribeSessions = onSnapshot(collection(db, "users", uid, "sessions"), (snapshot) => {
        if (!active) return;
        const ids = new Set(snapshot.docs.map((document) => document.id));
        let changed = false;
        for (const [id, session] of sessions) {
          if (!ids.has(id)) {
            sessions.delete(id);
            session.unsubscribe?.();
            changed = true;
          }
        }
        for (const id of ids) {
          if (sessions.has(id)) continue;
          changed = true;
          const session = { recordings: null, unsubscribe: null };
          sessions.set(id, session);
          try {
            session.unsubscribe = onSnapshot(collection(db, "users", uid, "sessions", id, "recordings"),
              (recordingsSnapshot) => {
                if (!active || sessions.get(id) !== session) return;
                session.recordings = recordingsSnapshot.docs.map((document) => {
                  const data = document.data();
                  return { ...data, id: document.id, sessionId: id,
                    processingStatus: data.processingStatus ?? data.status };
                });
                publish();
              }, (error) => {
                if (sessions.get(id) === session) fail(error);
              });
          } catch (error) {
            fail(error);
            return;
          }
        }
        if (changed || ids.size === 0) publish();
      }, fail);
    } catch (error) {
      fail(error);
    }
    return cleanup;
  }, [uid, retryVersion]);

  // Hide the previous account synchronously, before effect cleanup runs.
  const current = uid && state?.uid === uid && state.retryVersion === retryVersion ? state : null;
  return {
    progress: current?.progress ?? EMPTY_PROGRESS,
    loading: initializing || Boolean(uid && (!current || current.loading)),
    errorMessage: current?.errorMessage ?? "",
    retry,
  };
}
