import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";

const LOCAL_RECORDINGS_KEY = "@speaksharp/local-recordings/v1";
const RECORDINGS_DIRECTORY = new Directory(
  Paths.document,
  "SpeakSharp",
  "recordings",
);

function requireRecordingId(recordingId) {
  if (
    typeof recordingId !== "string" ||
    !recordingId.trim() ||
    recordingId.includes("/")
  ) {
    const error = new Error("A valid recording ID is required.");
    error.code = "recording/invalid-id";
    throw error;
  }
  return recordingId.trim();
}

function localStorageError(code, message, cause) {
  const error = new Error(message);
  error.code = code;
  error.cause = cause;
  return error;
}

async function readMappings() {
  try {
    const value = await AsyncStorage.getItem(LOCAL_RECORDINGS_KEY);
    if (!value) return {};
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Local recording map is invalid.");
    }
    return parsed;
  } catch (error) {
    throw localStorageError(
      "recording/local-map-read-failed",
      "Could not read local recording information.",
      error,
    );
  }
}

async function writeMappings(mappings) {
  try {
    await AsyncStorage.setItem(
      LOCAL_RECORDINGS_KEY,
      JSON.stringify(mappings),
    );
  } catch (error) {
    throw localStorageError(
      "recording/local-map-write-failed",
      "Could not save local recording information.",
      error,
    );
  }
}

function recordingFile(recordingId) {
  return new File(RECORDINGS_DIRECTORY, `${recordingId}.m4a`);
}

function isUriInside(uri, directory) {
  const prefix = directory.uri.endsWith("/")
    ? directory.uri
    : `${directory.uri}/`;
  return typeof uri === "string" && uri.startsWith(prefix);
}

export async function persistRecording(sourceUri, recordingId) {
  const normalizedId = requireRecordingId(recordingId);
  try {
    const source = new File(sourceUri);
    const sourceInfo = source.info();
    if (!sourceInfo.exists || !sourceInfo.size) {
      throw new Error("The temporary audio file is missing or empty.");
    }

    RECORDINGS_DIRECTORY.create({ intermediates: true, idempotent: true });
    const destination = recordingFile(normalizedId);
    await source.copy(destination, { overwrite: true });

    const destinationInfo = destination.info();
    if (!destinationInfo.exists || !destinationInfo.size) {
      throw new Error("The persisted audio file is missing or empty.");
    }

    try {
      const mappings = await readMappings();
      mappings[normalizedId] = destination.uri;
      await writeMappings(mappings);
    } catch (error) {
      if (destination.exists) destination.delete();
      throw error;
    }

    return destination.uri;
  } catch (error) {
    if (error?.code?.startsWith("recording/")) throw error;
    throw localStorageError(
      "recording/local-persistence-failed",
      "Could not persist the recording locally.",
      error,
    );
  }
}

export async function getLocalRecordingUri(recordingId) {
  const normalizedId = requireRecordingId(recordingId);
  const mappings = await readMappings();
  const uri = mappings[normalizedId];
  if (!uri || !isUriInside(uri, RECORDINGS_DIRECTORY)) return null;
  return new File(uri).exists ? uri : null;
}

export async function deleteLocalRecording(recordingId, { onlyMapped = false } = {}) {
  const normalizedId = requireRecordingId(recordingId);
  const mappings = await readMappings();
  const mappedUri = mappings[normalizedId];
  if (onlyMapped) {
    if (!mappedUri) return;
    if (mappedUri !== recordingFile(normalizedId).uri) {
      throw localStorageError("recording/local-delete-failed", "The local audio reference does not match this recording.");
    }
  }
  const file =
    mappedUri && isUriInside(mappedUri, RECORDINGS_DIRECTORY)
      ? new File(mappedUri)
      : recordingFile(normalizedId);

  try {
    if (file.exists) file.delete();
    if (Object.hasOwn(mappings, normalizedId)) {
      delete mappings[normalizedId];
      await writeMappings(mappings);
    }
  } catch (error) {
    throw localStorageError(
      "recording/local-delete-failed",
      "Could not remove the local recording.",
      error,
    );
  }
}

export async function deleteTemporaryAudio(uri) {
  if (!isUriInside(uri, Paths.cache)) return;
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch (error) {
    throw localStorageError(
      "recording/temp-delete-failed",
      "Could not remove the temporary recording.",
      error,
    );
  }
}
