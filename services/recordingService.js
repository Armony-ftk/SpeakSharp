import {
  collection,
  doc,
  deleteField,
  getDoc,
  getDocs,
  orderBy,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { RECORDING_STATUS } from "../constants/recordindStatuses";
import { MAX_RECORDING_SECONDS, recordingAudioPath } from "../constants/recording";
import { requestRecordingDeletion } from "./processingService";
import { deleteLocalRecording } from "../storage/audioStorage";

function normalizeRecording(snapshot) {
  const { status, storagePath, duration, ...data } = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    processingStatus: data.processingStatus ?? status,
    audioPath: data.audioPath ?? storagePath,
    durationSeconds: data.durationSeconds ?? duration,
  };
}

function requireCurrentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    const error = new Error("You must be signed in to manage recordings.");
    error.code = "auth/no-current-user";
    throw error;
  }
  return uid;
}

function requireDocumentId(value, label) {
  if (typeof value !== "string" || !value.trim() || value.includes("/")) {
    const error = new Error(`A valid ${label} is required.`);
    error.code = "recording/invalid-id";
    throw error;
  }
  return value.trim();
}

function requireDuration(duration) {
  if (
    !Number.isInteger(duration) ||
    duration <= 0 ||
    duration > MAX_RECORDING_SECONDS
  ) {
    const error = new Error("Recording duration is invalid.");
    error.code = "recording/invalid-duration";
    throw error;
  }
  return duration;
}

function recordingsCollection(uid, sessionId) {
  return collection(db, "users", uid, "sessions", sessionId, "recordings");
}

function recordingDocument(uid, sessionId, recordingId) {
  return doc(
    db,
    "users",
    uid,
    "sessions",
    sessionId,
    "recordings",
    recordingId,
  );
}

export function createRecordingId(sessionId) {
  const uid = requireCurrentUid();
  const normalizedSessionId = requireDocumentId(sessionId, "session ID");
  return doc(recordingsCollection(uid, normalizedSessionId)).id;
}

export async function createRecording(sessionId, recordingId, recordingData) {
  const uid = requireCurrentUid();
  const normalizedSessionId = requireDocumentId(sessionId, "session ID");
  const normalizedRecordingId = requireDocumentId(
    recordingId,
    "recording ID",
  );
  const duration = requireDuration(recordingData?.duration);
  const reference = recordingDocument(
    uid,
    normalizedSessionId,
    normalizedRecordingId,
  );

  const existing = await getDoc(reference);
  if (existing.exists()) {
    const data = normalizeRecording(existing);
    if (
      !data.deleting && data.processingStatus === RECORDING_STATUS.PENDING_UPLOAD &&
      data.durationSeconds === duration
    ) {
      return normalizedRecordingId;
    }
    const error = new Error("This recording ID is already in use.");
    error.code = "recording/id-conflict";
    throw error;
  }

  await setDoc(reference, {
    userId: uid,
    sessionId: normalizedSessionId,
    audioPath: recordingAudioPath(uid, normalizedSessionId, normalizedRecordingId),
    durationSeconds: duration,
    processingStatus: RECORDING_STATUS.PENDING_UPLOAD,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return normalizedRecordingId;
}

export async function getRecordings(sessionId) {
  const uid = requireCurrentUid();
  const normalizedSessionId = requireDocumentId(sessionId, "session ID");
  const snapshot = await getDocs(
    query(
      recordingsCollection(uid, normalizedSessionId),
      orderBy("createdAt", "desc"),
    ),
  );
  return snapshot.docs.map(normalizeRecording);
}

export async function getRecording(sessionId, recordingId) {
  const uid = requireCurrentUid();
  const normalizedSessionId = requireDocumentId(sessionId, "session ID");
  const normalizedRecordingId = requireDocumentId(
    recordingId,
    "recording ID",
  );
  const snapshot = await getDoc(
    recordingDocument(uid, normalizedSessionId, normalizedRecordingId),
  );

  return snapshot.exists()
    ? normalizeRecording(snapshot)
    : null;
}

export function subscribeToRecording(sessionId, recordingId, onChange, onError) {
  const reference = recordingDocument(
    requireCurrentUid(),
    requireDocumentId(sessionId, "session ID"),
    requireDocumentId(recordingId, "recording ID"),
  );
  return onSnapshot(reference, (snapshot) => {
    onChange(snapshot.exists() ? normalizeRecording(snapshot) : null);
  }, onError);
}

export async function prepareRecordingUpload(sessionId, recordingId) {
  const uid = requireCurrentUid();
  const sid = requireDocumentId(sessionId, "session ID");
  const rid = requireDocumentId(recordingId, "recording ID");
  const reference = recordingDocument(uid, sid, rid);
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) throw new Error("The recording no longer exists.");
    const data = normalizeRecording(snapshot);
    if (data.deleting) throw new Error("This recording is being deleted. Please retry deletion from the session.");
    if (![RECORDING_STATUS.PENDING_UPLOAD, RECORDING_STATUS.FAILED].includes(data.processingStatus)) {
      throw new Error("This recording has already started processing.");
    }
    const raw = snapshot.data();
    const audioPath = data.audioPath ?? recordingAudioPath(uid, sid, rid, true);
    if (![recordingAudioPath(uid, sid, rid), recordingAudioPath(uid, sid, rid, true)].includes(audioPath)) {
      throw new Error("The recording audio path is invalid.");
    }
    if (!raw.processingStatus) {
      // Upgrade only this legacy pending recording when the user resumes its upload.
      transaction.update(reference, {
        userId: uid, sessionId: sid, audioPath,
        durationSeconds: requireDuration(data.durationSeconds),
        processingStatus: data.processingStatus,
        status: deleteField(), storagePath: deleteField(), duration: deleteField(),
        updatedAt: serverTimestamp(),
      });
    }
    return audioPath;
  });
}

export async function markRecordingUploaded(
  sessionId,
  recordingId,
  storagePath,
) {
  const uid = requireCurrentUid();
  const normalizedSessionId = requireDocumentId(sessionId, "session ID");
  const normalizedRecordingId = requireDocumentId(
    recordingId,
    "recording ID",
  );
  if (![false, true].some((legacy) => storagePath === recordingAudioPath(
    uid, normalizedSessionId, normalizedRecordingId, legacy,
  ))) {
    const error = new Error("The recording Storage path is invalid.");
    error.code = "recording/invalid-storage-path";
    throw error;
  }

  await updateDoc(
    recordingDocument(uid, normalizedSessionId, normalizedRecordingId),
    {
      uploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );
}

export async function deleteRecording(sessionId, recordingId) {
  requireCurrentUid();
  const sid = requireDocumentId(sessionId, "session ID");
  const rid = requireDocumentId(recordingId, "recording ID");
  const result = await requestRecordingDeletion(sid, rid);
  if (result?.success !== true) throw new Error("Deletion was not confirmed.");
  try {
    await deleteLocalRecording(rid, { onlyMapped: true });
    return { ...result, localCleanupFailed: false };
  } catch {
    // Cloud deletion succeeded. A device-file failure must not report cloud failure.
    return { ...result, localCleanupFailed: true };
  }
}

export function getRecordingDeletionErrorMessage(error) {
  const messages = {
    "auth/no-current-user": "Your session has ended. Please sign in again.",
    "functions/unauthenticated": "Your session has ended. Please sign in again.",
    "functions/permission-denied": "You do not have permission to delete this recording.",
    "functions/not-found": "This session no longer exists. Return to your sessions and refresh.",
    "functions/invalid-argument": "This recording could not be identified. Refresh the session and try again.",
    "functions/failed-precondition": "Deletion could not finish. If the session is being deleted, retry session deletion; otherwise retry this recording or contact support.",
  };
  return messages[error?.code]
    ?? "Deletion could not be confirmed. Check your connection and retry Delete. The request may already have reached the server.";
}

export function getTranscriptionErrorMessage(code) {
  const messages = {
    no_speech: "No speech was detected. Your audio is safe; try recording a new attempt with clear speech.",
    provider_rate_limit: "Transcription is busy. Your audio is safe; please retry later.",
    provider_credits: "Transcription is temporarily unavailable. Please ask the project administrator to check the provider account.",
    provider_auth: "Transcription is not configured correctly. Please contact the project administrator.",
    secret_missing: "Transcription is not configured correctly. Please contact the project administrator.",
    invalid_duration: "The recording must be between 1 second and 15 minutes.",
    invalid_audio_duration: "The audio duration is outside the supported 15-minute limit.",
    invalid_audio_size: "The audio file is empty or exceeds the 32 MB limit.",
    invalid_audio: "The audio could not be transcribed. Your saved recording has been kept.",
    audio_missing: "The uploaded audio could not be found. Retry to upload the saved recording again.",
  };
  return messages[code] ?? "Transcription failed. Your audio is safe; please check your connection and retry later.";
}

export function getRecordingErrorMessage(error) {
  if (__DEV__) {
    console.warn("Recording operation failed", error);
  }

  const messages = {
    "auth/no-current-user": "Your session has ended. Please sign in again.",
    "recording/invalid-id": "This recording could not be linked to the session.",
    "recording/invalid-duration": "The recording duration is invalid.",
    "recording/id-conflict": "This recording could not be saved. Please record again.",
    "recording/local-map-read-failed":
      "Local recording information could not be read. Please try again.",
    "recording/local-map-write-failed":
      "The recording could not be saved on this device.",
    "recording/local-persistence-failed":
      "The recording could not be saved on this device.",
    "recording/local-delete-failed":
      "The previous recording could not be removed. Please try again.",
    "permission-denied":
      "You do not have permission to add a recording to this session.",
    "firestore/permission-denied":
      "You do not have permission to add a recording to this session.",
    unavailable:
      "The recording is safe on this screen, but its metadata could not be saved. Check your connection and try again.",
    "firestore/unavailable":
      "The recording is safe on this screen, but its metadata could not be saved. Check your connection and try again.",
  };

  return (
    messages[error?.code] ??
    "The recording could not be accepted. Your current recording is still available; please try again."
  );
}
