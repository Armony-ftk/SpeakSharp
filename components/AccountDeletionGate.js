import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "../hooks/useAuth";
import { useAppTheme } from "../constants/ThemeContext";
import ScreenContainer from "./ui/ScreenContainer";
import AuthTextField from "./ui/AuthTextField";
import PrimaryButton from "./ui/PrimaryButton";
import { accountDeletionRunning, confirmAccountDeletion, deleteOwnAccount, getAccountDeletionError } from "../services/accountDeletionService";
import { getAccountDeletions, restoreAccountDeletions, subscribeAccountDeletion } from "../storage/accountDeletionState";

// Lives above route/Auth changes: backend Auth deletion cannot unmount cleanup.
export default function AccountDeletionGate({ children }) {
  const { currentUser } = useAuth();
  const { colors } = useAppTheme();
  const [states, setStates] = useState(getAccountDeletions);
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const uid = currentUser?.uid ?? (!dismissed ? Object.keys(states)[0] : null);
  const pending = uid && states[uid];
  const restore = () => {
    setRestoreError(false);
    void restoreAccountDeletions().then(() => setReady(true)).catch(() => setRestoreError(true));
  };
  useEffect(() => {
    const unsubscribe = subscribeAccountDeletion(() => setStates({ ...getAccountDeletions() }));
    restore();
    return unsubscribe;
  }, []);
  useEffect(() => { setPassword(""); setMessage(""); }, [uid]);
  const run = async (resume = false) => {
    if (busy) return;
    setBusy(true); setMessage("");
    const enteredPassword = password; setPassword("");
    try {
      if (resume) await deleteOwnAccount(enteredPassword, uid);
      else await confirmAccountDeletion(uid);
    } catch (error) {
      setMessage(getAccountDeletions()[uid]?.phase === "confirmed"
        ? "Your account was deleted. Local cleanup could not finish. Tap retry cleanup to finish removing this account's saved audio."
        : getAccountDeletionError(error));
    }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!ready || !pending) return;
    // The initial request belongs to the service, even if Settings unmounts.
    // This check joins it and displays its eventual result or error.
    void run();
  }, [ready, uid, Boolean(pending)]);
  if (!ready) return <View style={{ flex: 1, justifyContent: "center", padding: 24 }}>
    {restoreError ? <><Text>Deletion recovery information could not be read. Uploads are paused.</Text><PrimaryButton label="Retry" onPress={restore} /></> : <><ActivityIndicator /><Text>Restoring account...</Text></>}
  </View>;
  if (!pending) return children;
  const working = busy || accountDeletionRunning(uid);
  return <ScreenContainer>
    <Text style={{ color: colors.navy, fontSize: 22, fontWeight: "700", marginBottom: 16 }}>
      {pending.phase === "confirmed" ? "Finishing local cleanup" : "Account deletion"}
    </Text>
    <Text style={{ color: colors.textSecondary, marginBottom: 16 }}>
      {working ? "Deleting your account..." : "Uploads are paused. Resume deletion or check whether the server has finished. Local recordings remain until deletion is confirmed."}
    </Text>
    {working ? <ActivityIndicator color={colors.accent} /> : <>
      {currentUser?.uid === uid && pending.phase !== "confirmed" ? <>
        <AuthTextField label="Current password" accessibilityLabel="Current password" value={password} onChangeText={setPassword} secureTextEntry textContentType="password" />
        <PrimaryButton label="Resume deletion" onPress={() => run(true)} />
      </> : null}
      <PrimaryButton label="Check deletion / retry cleanup" onPress={() => run()} />
      {!currentUser ? <PrimaryButton label="Continue to sign in" onPress={() => setDismissed(true)} /> : null}
    </>}
    {message ? <Text accessibilityRole="alert" style={{ color: "#D92D20", marginTop: 16 }}>{message}</Text> : null}
  </ScreenContainer>;
}
