export const MAX_RECORDING_SECONDS = 15 * 60;

export function recordingAudioPath(uid, sessionId, recordingId, legacy = false) {
  return legacy
    ? `users/${uid}/sessions/${sessionId}/recordings/${recordingId}.m4a`
    : `recordings/${uid}/${sessionId}/${recordingId}.m4a`;
}
