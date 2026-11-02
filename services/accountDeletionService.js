import { EmailAuthProvider, reauthenticateWithCredential, signOut } from "firebase/auth";
import { collection, getDocsFromServer } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import * as Crypto from "expo-crypto";
import NetInfo from "@react-native-community/netinfo";
import { auth, db, functions } from "../config/firebase";
import { recordingSync } from "./recordingSyncService";
import { clearAccountRecordingQueue, settleAccountRecordingSaves } from "../storage/recordingQueue";
import { claimLocalRecordingOwnership, deleteAccountLocalAudio } from "../storage/audioStorage";
import { forgetAccountDeletion, getAccountDeletions, pauseAccountUploads, restoreAccountDeletions, saveAccountDeletion } from "../storage/accountDeletionState";

const callable = httpsCallable(functions, "deleteAccount", { timeout: 540000 });
const confirmationCallable = httpsCallable(functions, "deleteAccount", { timeout: 30000 });
const requests = new Map();
const error = (code, message) => Object.assign(new Error(message), { code });
export const accountDeletionRunning = (uid) => requests.has(uid);

async function online() {
  const state = await NetInfo.fetch();
  if (!state.isConnected || state.isInternetReachable === false) throw error("deletion/offline", "Connect to the internet to delete your account.");
}
async function reauthenticate(uid, password) {
  const user = auth.currentUser;
  if (user?.uid !== uid || !user.email) throw error("auth/requires-recent-login", "Sign in to this account again to resume deletion.");
  if (!password) throw error("auth/wrong-password", "Enter your current password.");
  await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  await user.getIdToken(true);
  if (auth.currentUser?.uid !== uid) throw error("auth/requires-recent-login", "Your account changed. Please sign in again.");
}
async function finishLocal(uid, state) {
  // Persist confirmation before removing a single local file. Restart retries it.
  await saveAccountDeletion(uid, { ...state, phase: "confirmed" });
  await settleAccountRecordingSaves(uid);
  await clearAccountRecordingQueue(uid);
  await deleteAccountLocalAudio(uid);
  if (auth.currentUser?.uid === uid) await signOut(auth);
  await forgetAccountDeletion(uid);
}
async function waitForUploads() {
  let timer;
  try {
    await Promise.race([recordingSync.idle(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(error("deletion/upload-busy", "An upload is still settling. Your recordings are retained. Resume deletion shortly.")), 120000);
    })]);
  } finally { clearTimeout(timer); }
}

function singleFlight(uid, action) {
  if (requests.has(uid)) return requests.get(uid);
  const task = Promise.resolve().then(action).finally(() => requests.delete(uid));
  requests.set(uid, task);
  return task;
}

export function deleteOwnAccount(password, resumeUid = auth.currentUser?.uid) {
  const uid = resumeUid;
  if (!uid) return Promise.reject(error("auth/requires-recent-login", "Please sign in again."));
  return singleFlight(uid, async () => {
    await restoreAccountDeletions();
    const releasePause = pauseAccountUploads(uid);
    try {
      let state = getAccountDeletions()[uid];
      if (state?.phase === "confirmed") return finishLocal(uid, state);
      await online();
      if (state?.phase === "submitted") {
        const confirmation = await confirmationCallable({ receipt: state.receipt, confirmOnly: true });
        if (confirmation.data?.success === true) return finishLocal(uid, state);
      }
      await reauthenticate(uid, password);
      if (!state) {
        const receipt = Array.from(await Crypto.getRandomBytesAsync(32), (byte) => byte.toString(16).padStart(2, "0")).join("");
        state = { receipt, phase: "prepared" };
        await saveAccountDeletion(uid, state);
      }
      await waitForUploads();
      await settleAccountRecordingSaves(uid);
      if (state.phase === "prepared") {
        // Adopt pre-queue URI mappings only when the server proves their owner.
        // New saves already persist ownership alongside their mapping.
        const sessions = await getDocsFromServer(collection(db, "users", uid, "sessions"));
        for (const session of sessions.docs) {
          const recordings = await getDocsFromServer(collection(session.ref, "recordings"));
          await claimLocalRecordingOwnership(uid, recordings.docs.map((recording) => recording.id));
        }
      }
      state = { ...state, phase: "submitted" };
      await saveAccountDeletion(uid, state);
      const result = await callable({ receipt: state.receipt });
      if (result.data?.success !== true) throw error("deletion/unconfirmed", "Deletion has not been confirmed. Your local recordings are retained. Resume deletion to check again.");
      await finishLocal(uid, state);
    } finally {
      releasePause();
      // Wrong password/offline before the durable intent is safe to resume.
      // A submitted intent still blocks the worker after this temporary pause.
      if (!getAccountDeletions()[uid]) void recordingSync.wake().catch(() => {});
    }
  });
}

export function confirmAccountDeletion(uid) {
  return singleFlight(uid, async () => {
    await restoreAccountDeletions();
    const state = getAccountDeletions()[uid];
    if (!state) return;
    if (state.phase === "confirmed") return finishLocal(uid, state);
    await online();
    const result = await confirmationCallable({ receipt: state.receipt, confirmOnly: true });
    if (result.data?.success !== true) throw error("deletion/unconfirmed", "Deletion is not yet confirmed. Your local recordings are retained. Enter your password to resume, or check again shortly.");
    await finishLocal(uid, state);
  });
}

export function getAccountDeletionError(errorValue) {
  const code = errorValue?.code;
  if (["auth/wrong-password", "auth/invalid-credential"].includes(code)) return "Incorrect password. Please try again.";
  if (["auth/requires-recent-login", "functions/failed-precondition", "functions/unauthenticated"].includes(code)) return "Confirm your current password again. If your session ended, sign in to resume deletion.";
  if (["deletion/offline", "auth/network-request-failed"].includes(code)) return "Connect to the internet and try again. Your local recordings are retained.";
  if (code === "functions/permission-denied") return "Account deletion is not permitted for this account. Please contact support.";
  if (code === "functions/aborted") return "Deletion is already running. Check again shortly.";
  if (code?.startsWith("deletion/")) return errorValue.message;
  return "Deletion could not be confirmed. Your local recordings are retained and uploads remain paused if deletion started. Resume deletion or check again.";
}
