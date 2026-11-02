import { doc, getDocFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { getMetadata, ref } from "firebase/storage";
import { auth, db, storage } from "../config/firebase";
import { recordingAudioPath } from "../constants/recording";
import { hasLocalAudio, getLocalRecordingUri } from "../storage/audioStorage";
import { getQueuedRecordings, repairQueuedAudio, restoreRecordingQueue as restoreQueue, saveQueuedRecording, updateQueuedRecording } from "../storage/recordingQueue";
import { uploadRecordingAudio } from "./audioUploadService";
import { createRecordingSyncWorker } from "../utils/recordingSyncWorker";
import { accountDeletionBlocked, restoreAccountDeletions } from "../storage/accountDeletionState";

let activeUid = null;
let connected = false;
const ensureOwner = (entry) => {
  if (accountDeletionBlocked(entry.userId) || auth.currentUser?.uid !== entry.userId || activeUid !== entry.userId) {
    throw Object.assign(new Error("Sign in as the recording owner to synchronize."), { code: "auth/account-changed" });
  }
};
const sessionRef = (entry) => doc(db, "users", entry.userId, "sessions", entry.sessionId);
const recordingRef = (entry) => doc(sessionRef(entry), "recordings", entry.recordingId);
const data = (snapshot) => snapshot.exists() ? { id: snapshot.id, ...snapshot.data(),
  processingStatus: snapshot.data().processingStatus ?? snapshot.data().status } : null;

const remote = {
  async session(entry) { ensureOwner(entry); return data(await getDocFromServer(sessionRef(entry))); },
  async recording(entry) { ensureOwner(entry); return data(await getDocFromServer(recordingRef(entry))); },
  async object(entry, recording) {
    ensureOwner(entry);
    const path = recording?.audioPath ?? recording?.storagePath ?? recordingAudioPath(entry.userId, entry.sessionId, entry.recordingId);
    if (![false, true].some((legacy) => path === recordingAudioPath(entry.userId, entry.sessionId, entry.recordingId, legacy))) {
      throw Object.assign(new Error("The recording audio path is invalid."), { code: "recording/id-conflict" });
    }
    try { return await getMetadata(ref(storage, path)); }
    catch (error) { if (error?.code === "storage/object-not-found") return null; throw error; }
  },
  async create(entry) {
    ensureOwner(entry);
    return runTransaction(db, async (transaction) => {
      const parent = await transaction.get(sessionRef(entry));
      const existing = await transaction.get(recordingRef(entry));
      ensureOwner(entry);
      if (!parent.exists() || parent.data().deleting) {
        throw Object.assign(new Error("This session no longer exists. Your audio is saved locally."), { code: "recording/session-missing" });
      }
      if (existing.exists()) return data(existing);
      const recording = { userId: entry.userId, sessionId: entry.sessionId,
        audioPath: recordingAudioPath(entry.userId, entry.sessionId, entry.recordingId),
        durationSeconds: entry.durationSeconds, processingStatus: "pending_upload",
        createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
      transaction.set(recordingRef(entry), recording);
      return recording;
    });
  },
  async receipt(entry) {
    ensureOwner(entry);
    // Preserve all backend fields and timestamps once the trigger has taken over.
    await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(recordingRef(entry));
      ensureOwner(entry);
      if (!snapshot.exists() || snapshot.data().deleting) throw Object.assign(new Error("This recording is unavailable. Your audio is retained."), { code: "recording/deleting" });
      if (snapshot.data().uploadedAt) return;
      transaction.update(recordingRef(entry), { uploadedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
  },
};

export const recordingSync = createRecordingSyncWorker({
  owner: () => !accountDeletionBlocked(activeUid) && activeUid === auth.currentUser?.uid ? activeUid : null,
  online: () => connected,
  remote,
  queue: { list: getQueuedRecordings,
    update: (entry, updates) => updateQueuedRecording(entry.userId, entry.recordingId, updates),
    hasAudio: (entry) => hasLocalAudio(entry.localUri, entry.byteLength) },
  upload: (entry) => { ensureOwner(entry); return uploadRecordingAudio(entry.sessionId, entry.recordingId, entry.userId); },
});

export function setRecordingSyncConnection(uid, online) {
  activeUid = uid;
  connected = online;
}

export async function retryQueuedUpload(sessionId, recordingId, retryProcessing = false) {
  const uid = auth.currentUser?.uid;
  const entry = { userId: uid, sessionId, recordingId };
  ensureOwner(entry);
  let saved = getQueuedRecordings(uid).find((item) => item.recordingId === recordingId);
  if (!saved) {
    const recording = await remote.recording(entry);
    const session = await remote.session(entry);
    if (!recording || !session) throw new Error("This recording or its session no longer exists.");
    const uri = await getLocalRecordingUri(recordingId);
    if (!uri) throw new Error("The saved audio could not be found on this device.");
    ensureOwner(entry);
    saved = await saveQueuedRecording({ ...entry, sourceUri: uri,
      durationSeconds: recording.durationSeconds ?? recording.duration, session });
  }
  if (saved.syncStatus === "uploading") return recordingSync.wake();
  if (saved.deletionPending) throw new Error("Deletion is unfinished. Retry Delete from the session before uploading.");
  await repairQueuedAudio(saved);
  const updated = await updateQueuedRecording(uid, recordingId, { syncStatus: "queued", blocked: false,
    nextRetryAt: 0, failures: 0, errorMessage: "", retryProcessing,
    uploadAttemptStarted: false, uploadConfirmed: false, generationBefore: null });
  // A listener acknowledgement may have removed the old handoff while we read
  // its file. Re-adopt that same ID instead of dropping the user's retry.
  if (!updated) return retryQueuedUpload(sessionId, recordingId, retryProcessing);
  await recordingSync.wake();
}

export async function restoreRecordingQueue(uid) {
  await restoreAccountDeletions();
  if (!accountDeletionBlocked(uid)) await restoreQueue(uid);
}

export async function pauseQueuedUploads(sessionId, recordingId) {
  const uid = auth.currentUser?.uid;
  const pending = getQueuedRecordings(uid).filter((entry) => entry.sessionId === sessionId
    && (!recordingId || entry.recordingId === recordingId));
  for (const entry of pending) await updateQueuedRecording(uid, entry.recordingId, { deletionPending: true });
  // The existing deletion callable then runs after any already-started upload.
  await recordingSync.idle();
  // Keep this intent across crashes/ambiguous callable failures. Only confirmed
  // deletion removes it, so a later queue restore cannot recreate a deleted ID.
}
