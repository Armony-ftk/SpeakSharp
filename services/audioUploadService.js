import { File } from "expo-file-system";
import { ref, uploadBytes } from "firebase/storage";
import { auth, storage } from "../config/firebase";
import { getLocalRecordingUri } from "../storage/audioStorage";

function requireCurrentUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    const error = new Error("You must be signed in to upload recordings.");
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

export function getRecordingStoragePath(sessionId, recordingId) {
  const uid = requireCurrentUid();
  const normalizedSessionId = requireDocumentId(sessionId, "session ID");
  const normalizedRecordingId = requireDocumentId(
    recordingId,
    "recording ID",
  );

  return `users/${uid}/sessions/${normalizedSessionId}/recordings/${normalizedRecordingId}.m4a`;
}

function readNativeFileBlob(localUri) {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const fail = () => {
      const error = new Error("The saved recording could not be read.");
      error.code = "recording/local-file-read-failed";
      reject(error);
    };

    request.open("GET", localUri);
    request.responseType = "blob";
    request.onload = () => {
      if (
        (request.status === 0 || request.status === 200) &&
        request.response?.size > 0
      ) {
        resolve(request.response);
      } else {
        fail();
      }
    };
    request.onerror = fail;
    request.onabort = fail;
    request.ontimeout = fail;
    request.send();
  });
}

export async function uploadRecordingAudio(sessionId, recordingId) {
  const storagePath = getRecordingStoragePath(sessionId, recordingId);
  const localUri = await getLocalRecordingUri(recordingId);

  if (!localUri) {
    const error = new Error("The saved recording could not be found.");
    error.code = "recording/local-file-missing";
    throw error;
  }

  const localFile = new File(localUri);
  const fileInfo = localFile.info();
  if (!fileInfo.exists || !fileInfo.size) {
    const error = new Error("The saved recording is missing or empty.");
    error.code = "recording/local-file-missing";
    throw error;
  }

  const audioBytes = await localFile.bytes();
  const storageRef = ref(storage, storagePath);
  const metadata = { contentType: "audio/mp4" };

  try {
    await uploadBytes(storageRef, audioBytes, metadata);
  } catch (error) {
    if (
      error?.message !==
      "Creating blobs from 'ArrayBuffer' and 'ArrayBufferView' are not supported"
    ) {
      throw error;
    }

    // Firebase's multipart encoder also wraps Uint8Array in a Blob internally.
    // Read a native file Blob to avoid that unsupported React Native conversion.
    const nativeBlob = await readNativeFileBlob(localUri);
    try {
      await uploadBytes(storageRef, nativeBlob, metadata);
    } finally {
      nativeBlob.close?.();
    }
  }

  return storagePath;
}

export function getUploadErrorMessage(error) {
  if (__DEV__) {
    console.warn("Recording upload failed", error);
  }

  if (error?.code === "recording/local-file-missing") {
    return "The saved recording could not be found on this device.";
  }

  if (error?.code === "auth/no-current-user") {
    return "Your session has ended. Please sign in again.";
  }

  return "Recording upload failed. Your recording is still saved on this device.";
}
