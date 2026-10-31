import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { auth } from "../config/firebase";

export function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export function sendVerificationEmail(user = auth.currentUser) {
  if (!user) {
    throw new Error("auth/no-current-user");
  }

  return sendEmailVerification(user);
}

export async function refreshEmailVerification(user = auth.currentUser) {
  if (!user) {
    throw new Error("auth/no-current-user");
  }

  await reload(user);
  return user;
}

export function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export function logout() {
  return signOut(auth);
}

export function observeAuthState(callback, onError) {
  return onAuthStateChanged(auth, callback, onError);
}

export function getAuthErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists with this email.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a stronger password and try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed":
      "Unable to connect. Check your internet connection and try again.",
    "auth/no-current-user": "Your session has ended. Please sign in again.",
  };

  if (__DEV__) {
    console.warn("Firebase authentication error", error);
  }

  return messages[error?.code ?? error?.message] ??
    "Something went wrong. Please try again.";
}
