import {
  Timestamp,
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { requestSessionDeletion } from "./processingService";

const VALID_STATUSES = new Set(["active", "completed"]);

function requireCurrentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    const error = new Error("You must be signed in to manage sessions.");
    error.code = "auth/no-current-user";
    throw error;
  }
  return uid;
}

function requireSessionId(sessionId) {
  if (
    typeof sessionId !== "string" ||
    !sessionId.trim() ||
    sessionId.includes("/")
  ) {
    throw new Error("A valid session ID is required.");
  }
  return sessionId.trim();
}

function normalizeTitle(title) {
  if (typeof title !== "string" || !title.trim()) {
    throw new Error("A session title is required.");
  }
  return title.trim();
}

function normalizeContext(context) {
  if (context == null) return null;
  if (typeof context !== "string") {
    throw new Error("Session context must be text.");
  }
  return context.trim() || null;
}

function normalizeTargetDurationSeconds(value) {
  if (value == null || value === "") return null;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("Target duration must be a positive number of seconds.");
  }
  return value;
}

function normalizePresentationDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Timestamp) return value;

  const date = typeof value?.toDate === "function" ? value.toDate() : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new Error("Presentation date is invalid.");
  }
  return Timestamp.fromDate(date);
}

function normalizeStatus(status) {
  if (!VALID_STATUSES.has(status)) {
    throw new Error("Session status must be active or completed.");
  }
  return status;
}

function sessionsCollection(uid) {
  return collection(db, "users", uid, "sessions");
}

function sessionDocument(uid, sessionId) {
  return doc(db, "users", uid, "sessions", sessionId);
}

export async function createSession(sessionData) {
  const uid = requireCurrentUid();
  const session = {
    title: normalizeTitle(sessionData?.title),
    context: normalizeContext(sessionData?.context),
    targetDurationSeconds: normalizeTargetDurationSeconds(
      sessionData?.targetDurationSeconds,
    ),
    presentationDate: normalizePresentationDate(sessionData?.presentationDate),
    status: "active",
    attemptCount: 0,
    latestRating: null,
    bestRating: null,
    ratingSum: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const reference = await addDoc(sessionsCollection(uid), session);
  return reference.id;
}

export async function getSessions() {
  const uid = requireCurrentUid();
  const snapshot = await getDocs(
    query(sessionsCollection(uid), orderBy("updatedAt", "desc")),
  );
  return snapshot.docs.map((snapshotDocument) => ({
    id: snapshotDocument.id,
    ...snapshotDocument.data(),
  }));
}

export async function getSessionById(sessionId) {
  const uid = requireCurrentUid();
  const normalizedId = requireSessionId(sessionId);
  const snapshot = await getDoc(sessionDocument(uid, normalizedId));
  if (!snapshot.exists()) return null;
  return { id: snapshot.id, ...snapshot.data() };
}

export async function updateSession(sessionId, updates) {
  const uid = requireCurrentUid();
  const normalizedId = requireSessionId(sessionId);
  const allowedUpdates = {};

  if (!updates || typeof updates !== "object" || Array.isArray(updates)) {
    throw new Error("Session updates are required.");
  }

  if (Object.hasOwn(updates, "title")) {
    allowedUpdates.title = normalizeTitle(updates.title);
  }
  if (Object.hasOwn(updates, "context")) {
    allowedUpdates.context = normalizeContext(updates.context);
  }
  if (Object.hasOwn(updates, "targetDurationSeconds")) {
    allowedUpdates.targetDurationSeconds = normalizeTargetDurationSeconds(
      updates.targetDurationSeconds,
    );
  }
  if (Object.hasOwn(updates, "presentationDate")) {
    allowedUpdates.presentationDate = normalizePresentationDate(
      updates.presentationDate,
    );
  }
  if (Object.hasOwn(updates, "status")) {
    allowedUpdates.status = normalizeStatus(updates.status);
  }

  if (Object.keys(allowedUpdates).length === 0) {
    throw new Error("No editable session fields were provided.");
  }

  await updateDoc(sessionDocument(uid, normalizedId), {
    ...allowedUpdates,
    updatedAt: serverTimestamp(),
  });
  return { id: normalizedId, ...allowedUpdates };
}

export async function deleteSession(sessionId) {
  requireCurrentUid();
  const normalizedId = requireSessionId(sessionId);
  return requestSessionDeletion(normalizedId);
}

export function getSessionErrorMessage(error) {
  const messages = {
    "auth/no-current-user": "Your session has ended. Please sign in again.",
    "permission-denied": "You do not have permission to access this session.",
    "functions/permission-denied":
      "You do not have permission to delete this session.",
    "functions/unauthenticated": "Your session has ended. Please sign in again.",
    "not-found": "This session no longer exists.",
    "functions/not-found": "This session no longer exists.",
    "functions/invalid-argument": "The session request was invalid.",
    "functions/internal":
      "The session could not be deleted. Please try again.",
    unavailable: "Unable to connect. Check your internet connection and try again.",
    "functions/unavailable":
      "Unable to connect. Check your internet connection and try again.",
  };

  if (__DEV__) {
    console.warn("Session operation failed", error);
  }

  if (error?.code === "functions/unauthenticated" && auth.currentUser) {
    return "Could not authenticate the deletion request. Please try again.";
  }

  return (
    messages[error?.code] ??
    (error?.message && !error.message.includes("Firebase")
      ? error.message
      : "Something went wrong. Please try again.")
  );
}
