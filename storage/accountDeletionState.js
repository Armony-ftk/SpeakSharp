import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@speaksharp/account-deletions/v1";
let states = {};
let restoration;
let writing = Promise.resolve();
const listeners = new Set();
const temporaryPauses = new Set();
export const subscribeAccountDeletion = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
export const getAccountDeletions = () => states;
export const accountDeletionStarted = (uid) => Boolean(states[uid]);
export const accountDeletionBlocked = (uid) => accountDeletionStarted(uid) || temporaryPauses.has(uid);
export function pauseAccountUploads(uid) {
  temporaryPauses.add(uid);
  return () => temporaryPauses.delete(uid);
}
export function restoreAccountDeletions() {
  restoration ??= AsyncStorage.getItem(KEY).then((raw) => {
    const saved = raw ? JSON.parse(raw) : {};
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) throw new Error("Deletion recovery information could not be read.");
    states = saved;
    listeners.forEach((listener) => listener());
  }).catch((error) => { restoration = null; throw error; });
  return restoration;
}
export function saveAccountDeletion(uid, state) {
  states = { ...states, [uid]: state };
  listeners.forEach((listener) => listener());
  const operation = writing.catch(() => {}).then(() => AsyncStorage.setItem(KEY, JSON.stringify(states)));
  writing = operation;
  return operation;
}
export function forgetAccountDeletion(uid) {
  const operation = writing.catch(() => {}).then(async () => {
    const next = { ...states }; delete next[uid];
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
    states = next;
    listeners.forEach((listener) => listener());
  });
  writing = operation;
  return operation;
}
