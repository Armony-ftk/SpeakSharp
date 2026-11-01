import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasLocalAudio, localAudioSize, persistRecording, persistentRecordingUri, deleteLocalRecording, deleteTemporaryAudio } from "./audioStorage";
import { accountDeletionStarted } from "./accountDeletionState";
import { MAX_RECORDING_SECONDS } from "../constants/recording";

const PREFIX = "@speaksharp/recording-queue/v1/";
const listeners = new Set();
const entries = new Map();
const operations = new Map();
const key = (uid, id) => `${PREFIX}${encodeURIComponent(uid)}/${id}`;
const publish = () => listeners.forEach((listener) => listener());
const fail = (code, message) => Object.assign(new Error(message), { code });

function validateId(value) {
  if (typeof value !== "string" || !value || /[/\\]|^\.{1,2}$/.test(value)) {
    throw fail("recording/invalid-id", "Invalid local recording identifier.");
  }
}

// Serial per-entry writes prevent save/retry/acknowledgement from replacing each other.
function locked(uid, id, action) {
  const storageKey = key(uid, id);
  const task = (operations.get(storageKey) ?? Promise.resolve()).catch(() => {}).then(action);
  operations.set(storageKey, task);
  task.finally(() => { if (operations.get(storageKey) === task) operations.delete(storageKey); }).catch(() => {});
  return task;
}

async function write(entry) {
  await AsyncStorage.setItem(key(entry.userId, entry.recordingId), JSON.stringify(entry));
  entries.set(key(entry.userId, entry.recordingId), entry);
  publish();
  return entry;
}

export function subscribeRecordingQueue(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getQueuedRecordings(uid) {
  return [...entries.values()].filter((entry) => entry.userId === uid && entry.syncStatus !== "saving");
}

export async function updateQueuedRecording(uid, id, updates) {
  return locked(uid, id, async () => {
    const entry = entries.get(key(uid, id));
    if (!entry) return null;
    return write({ ...entry, ...updates });
  });
}

export async function removeQueuedRecording(uid, id, { onlySynced = false } = {}) {
  return locked(uid, id, async () => {
    const entry = entries.get(key(uid, id));
    if (onlySynced && (entry?.syncStatus !== "synced" || entry.retryProcessing || entry.deletionPending)) return;
    await AsyncStorage.removeItem(key(uid, id));
    entries.delete(key(uid, id));
    publish();
  });
}

export async function saveQueuedRecording({ userId, sessionId, recordingId, sourceUri, durationSeconds, session }) {
  [userId, sessionId, recordingId].forEach(validateId);
  if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_RECORDING_SECONDS) {
    throw fail("recording/invalid-duration", "Recording duration is invalid.");
  }
  return locked(userId, recordingId, async () => {
    const storageKey = key(userId, recordingId);
    const existing = entries.get(storageKey) ?? JSON.parse(await AsyncStorage.getItem(storageKey) || "null");
    // The journal precedes the copy. A restart can finish the copy or re-index the
    // deterministic document file if the process stopped between these two writes.
    const journal = existing ?? {
      userId, sessionId, recordingId, localUri: persistentRecordingUri(recordingId),
      sourceUri, byteLength: localAudioSize(sourceUri), durationSeconds, createdAt: Date.now(), syncStatus: "saving",
      session: { id: sessionId, title: session?.title ?? "Practice session",
        status: session?.status ?? "active", targetDurationSeconds: session?.targetDurationSeconds ?? null },
    };
    if (accountDeletionStarted(userId)) {
      // A save already dispatched by an unmounting recorder must leave a cleanup
      // reference. Retain its source until cloud deletion is confirmed; never copy
      // or synchronize it while deletion is pending.
      if (!existing) await write({ ...journal, deletionPending: true });
      throw fail("recording/account-deleting", "Account deletion is pending. Resume deletion before saving recordings.");
    }
    if (existing && existing.syncStatus !== "saving") return existing;
    await write(journal);
    const source = hasLocalAudio(journal.localUri, journal.byteLength) ? journal.localUri : journal.sourceUri;
    await persistRecording(source, recordingId, userId);
    const { sourceUri: _source, ...saved } = journal;
    return write({ ...saved, syncStatus: "queued", failures: 0, nextRetryAt: 0 });
  });
}

export async function restoreRecordingQueue(uid) {
  const prefix = `${PREFIX}${encodeURIComponent(uid)}/`;
  const keys = (await AsyncStorage.getAllKeys()).filter((value) => value.startsWith(prefix));
  let restoreError;
  for (const storageKey of keys) {
    const id = storageKey.slice(prefix.length);
    try { await locked(uid, id, async () => {
      const raw = await AsyncStorage.getItem(storageKey);
      if (!raw) return;
      const entry = JSON.parse(raw);
      [entry.userId, entry.sessionId, entry.recordingId].forEach(validateId);
      if (entry.userId !== uid || entry.recordingId !== id || entry.localUri !== persistentRecordingUri(id)) {
        throw fail("recording/local-persistence-failed", "Saved recording information is invalid. Audio has been retained.");
      }
      entries.set(storageKey, entry);
      if (entry.syncStatus === "saving") {
        try {
          await persistRecording(hasLocalAudio(entry.localUri, entry.byteLength) ? entry.localUri : entry.sourceUri, id, uid);
          const { sourceUri: _source, ...saved } = entry;
          await write({ ...saved, syncStatus: "queued", failures: 0, nextRetryAt: 0 });
        } catch {
          await write({ ...entry, syncStatus: "error", blocked: true,
            errorMessage: "The saved audio could not be recovered. Free device space and retry; your files have been retained." });
        }
      } else if (["uploading", "synced"].includes(entry.syncStatus)) {
        await write({ ...entry, syncStatus: "queued",
          remoteDocumentSeen: entry.remoteDocumentSeen || entry.syncStatus === "synced" });
      }
    }); } catch (error) { restoreError ??= error; }
  }
  publish();
  if (restoreError) throw restoreError;
  return getQueuedRecordings(uid);
}

export async function repairQueuedAudio(entry) {
  const source = hasLocalAudio(entry.localUri, entry.byteLength) ? entry.localUri
    : hasLocalAudio(entry.sourceUri, entry.byteLength) ? entry.sourceUri : null;
  if (source) await persistRecording(source, entry.recordingId, entry.userId);
}

export async function settleAccountRecordingSaves(uid) {
  const prefix = `${PREFIX}${encodeURIComponent(uid)}/`;
  await Promise.all([...operations].filter(([storageKey]) => storageKey.startsWith(prefix)).map(([, task]) => task.catch(() => {})));
}

export async function clearAccountRecordingQueue(uid) {
  await settleAccountRecordingSaves(uid);
  const prefix = `${PREFIX}${encodeURIComponent(uid)}/`;
  for (const storageKey of (await AsyncStorage.getAllKeys()).filter((value) => value.startsWith(prefix))) {
    const id = storageKey.slice(prefix.length);
    validateId(id);
    const raw = await AsyncStorage.getItem(storageKey);
    const entry = raw ? JSON.parse(raw) : null;
    if (entry && (entry.userId !== uid || entry.recordingId !== id)) throw new Error("Local recording ownership could not be verified.");
    await deleteLocalRecording(id, { expectedOwner: uid });
    if (entry?.sourceUri) await deleteTemporaryAudio(entry.sourceUri);
    await removeQueuedRecording(uid, id);
  }
}

export function localRecording(entry) {
  return { id: entry.recordingId, userId: entry.userId, sessionId: entry.sessionId,
    durationSeconds: entry.durationSeconds, createdAt: new Date(entry.createdAt),
    processingStatus: "pending_upload", localSyncStatus: entry.syncStatus,
    localError: entry.errorMessage, localUri: entry.localUri, deleting: Boolean(entry.deletionPending) };
}

export function mergeRecordings(remote = [], local = []) {
  const merged = new Map(local.map((entry) => [entry.recordingId, localRecording(entry)]));
  remote.forEach((recording) => {
    const pending = merged.get(recording.id);
    merged.set(recording.id, { ...pending, ...recording });
  });
  const time = (value) => value?.toMillis?.() ?? (value instanceof Date ? value.getTime()
    : value?.seconds != null ? value.seconds * 1000 : 0);
  return [...merged.values()].sort((a, b) => time(b.createdAt) - time(a.createdAt) || b.id.localeCompare(a.id));
}

export function mergeSessionEntries(remoteEntries, local) {
  const sessions = new Map(remoteEntries.map((entry) => [entry.data.id, { ...entry,
    recordings: mergeRecordings(entry.recordings ?? [], local.filter((pending) => pending.sessionId === entry.data.id)) }]));
  local.forEach((entry) => {
    if (!sessions.has(entry.sessionId)) sessions.set(entry.sessionId, {
      data: { ...entry.session, updatedAt: new Date(entry.createdAt), localOnly: true },
      recordings: mergeRecordings([], local.filter((pending) => pending.sessionId === entry.sessionId)),
    });
  });
  return [...sessions.values()];
}
