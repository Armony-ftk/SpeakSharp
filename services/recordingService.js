import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { RECORDING_STATUS } from "../constants/recordindStatuses";
import { MAX_RECORDING_SECONDS } from "../constants/recording";

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
    const data = existing.data();
    if (
      data.status === RECORDING_STATUS.PENDING_UPLOAD &&
      data.duration === duration
    ) {
      return normalizedRecordingId;
    }
    const error = new Error("This recording ID is already in use.");
    error.code = "recording/id-conflict";
    throw error;
  }

  await setDoc(reference, {
    duration,
    status: RECORDING_STATUS.PENDING_UPLOAD,
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
  return snapshot.docs.map((snapshotDocument) => ({
    id: snapshotDocument.id,
    ...snapshotDocument.data(),
  }));
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
