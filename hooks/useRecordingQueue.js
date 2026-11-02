import { useEffect, useState } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { getQueuedRecordings, subscribeRecordingQueue } from "../storage/recordingQueue";
import { recordingSync, restoreRecordingQueue, setRecordingSyncConnection } from "../services/recordingSyncService";

export function useRecordingQueue(uid) {
  const [state, setState] = useState(null);
  useEffect(() => {
    if (!uid) { setRecordingSyncConnection(null, false); return; }
    let active = true, ready = false, online = false, timer, persistenceError = "";
    const report = () => {
      persistenceError = "Local recording information could not be updated. Your audio has been retained. Retry by reopening the app.";
      if (active) setState({ uid, entries: getQueuedRecordings(uid), online, ready,
        errorMessage: persistenceError });
    };
    const wake = () => {
      if (!active || !ready) return;
      void recordingSync.wake().catch(report);
    };
    const publish = () => {
      if (!active) return;
      const entries = getQueuedRecordings(uid);
      setState({ uid, entries, online, ready, errorMessage: persistenceError });
      clearTimeout(timer);
      // One bounded backoff timer, only while foregrounded and reachable.
      const due = entries.filter((entry) => !entry.blocked && ["queued", "error"].includes(entry.syncStatus)
        && entry.failures > 0 && entry.failures < 5).map((entry) => entry.nextRetryAt);
      if (ready && online && AppState.currentState === "active" && due.length) {
        timer = setTimeout(wake, Math.max(1000, Math.min(...due) - Date.now()));
      }
    };
    const connection = (value) => {
      if (!active) return;
      const wasOnline = online;
      online = value.isConnected === true && value.isInternetReachable !== false;
      setRecordingSyncConnection(uid, online && AppState.currentState === "active");
      publish();
      if (online && !wasOnline) wake();
    };
    setRecordingSyncConnection(uid, false);
    const unsubscribeQueue = subscribeRecordingQueue(() => { publish(); wake(); });
    const unsubscribeNetwork = NetInfo.addEventListener(connection);
    const foreground = AppState.addEventListener("change", (value) => {
      if (!active) return;
      setRecordingSyncConnection(uid, online && value === "active");
      publish();
      if (value === "active") void NetInfo.fetch().then(connection).then(wake).catch(report);
    });
    void restoreRecordingQueue(uid).then(() => {
      if (!active) return;
      ready = true; publish(); wake();
    }).catch(() => { if (active) { ready = true; report(); wake(); } });
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribeQueue(); unsubscribeNetwork(); foreground.remove();
      setRecordingSyncConnection(null, false);
    };
  }, [uid]);
  const current = state?.uid === uid ? state : null;
  return { entries: current?.entries ?? [], online: current?.online ?? false,
    loading: Boolean(uid && !current?.ready), errorMessage: current?.errorMessage ?? "" };
}
