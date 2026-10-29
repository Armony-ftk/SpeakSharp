import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

const deleteSessionCallable = httpsCallable(functions, "deleteSession");
const retryAnalysisCallable = httpsCallable(functions, "retryRecordingAnalysis");

export async function requestAnalysisRetry(sessionId, recordingId) {
  const result = await retryAnalysisCallable({ sessionId, recordingId });
  return result.data;
}

export async function requestSessionDeletion(sessionId) {
  const result = await deleteSessionCallable({ sessionId });
  return result.data;
}
