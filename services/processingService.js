import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";

const deleteSessionCallable = httpsCallable(functions, "deleteSession");

export async function requestSessionDeletion(sessionId) {
  const result = await deleteSessionCallable({ sessionId });
  return result.data;
}
