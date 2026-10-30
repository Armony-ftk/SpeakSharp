import { doc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../config/firebase";

export function createUserProfile(uid, { fullName, email }) {
  return setDoc(doc(db, "users", uid), {
    fullName,
    email,
    createdAt: serverTimestamp(),
  });
}

export function updateFullName(uid, fullName) {
  if (!uid || auth.currentUser?.uid !== uid) {
    throw new Error("Your session has changed. Please sign in again.");
  }
  if (typeof fullName !== "string" || !fullName.trim()) {
    throw new Error("Enter your full name.");
  }
  return updateDoc(doc(db, "users", uid), { fullName: fullName.trim() });
}
