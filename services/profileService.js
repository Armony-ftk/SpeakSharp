import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../config/firebase";

export function createUserProfile(uid, { fullName, email }) {
  return setDoc(doc(db, "users", uid), {
    fullName,
    email,
    createdAt: serverTimestamp(),
  });
}
