// One worker for the application. All triggers and manual retries enter here.
// Adapters keep native persistence and Firebase calls testable without a device.
export function createRecordingSyncWorker({ queue, remote, upload, owner, online, now = Date.now }) {
  let running = null;
  let again = false;
  const assertOwner = (entry) => {
    if (owner() !== entry.userId) throw Object.assign(new Error("Sign in as the recording owner to synchronize."), { code: "auth/account-changed" });
  };
  const completedUpload = (recording) => Boolean(recording?.uploadedAt || recording?.transcript?.originalText
    || ["transcribing", "transcript_ready", "analysing", "completed"].includes(recording?.processingStatus));

  async function synchronize(entry) {
    try {
      assertOwner(entry);
      const session = await remote.session(entry);
      assertOwner(entry);
      if (!session || session.deleting) throw Object.assign(new Error("This session was deleted or is being deleted. The local audio has been retained."), { code: "recording/session-missing" });
      let recording = await remote.recording(entry);
      assertOwner(entry);
      if (!recording && entry.remoteDocumentSeen) {
        throw Object.assign(new Error("This recording was removed from Firebase. Your local audio has been retained."), { code: "recording/deleting" });
      }
      if (recording && !entry.remoteDocumentSeen) await queue.update(entry, { remoteDocumentSeen: true });
      assertOwner(entry);
      if (recording?.deleting) throw Object.assign(new Error("This recording is being deleted. Retry deletion from the session."), { code: "recording/deleting" });
      const explicitRetry = entry.retryProcessing && recording?.processingStatus === "failed"
        && !recording?.transcript?.originalText && !["metrics", "metrics_saving", "analysis"].includes(recording?.processingError?.stage);
      if (completedUpload(recording) && !explicitRetry) {
        await queue.update(entry, { syncStatus: "synced", errorMessage: "", blocked: false });
        return;
      }
      // Storage reads are allowed for the owner by the existing rules. A read
      // failure is never interpreted as a missing object.
      const object = await remote.object(entry, recording);
      assertOwner(entry);
      const recoveredRetry = entry.uploadAttemptStarted && object
        && object.generation !== entry.generationBefore;
      if ((object && !explicitRetry) || recoveredRetry || entry.uploadConfirmed) {
        if (!recording) throw Object.assign(new Error("Uploaded audio has no recording document. Your audio has been retained; contact support."), { code: "recording/id-conflict" });
        await remote.receipt(entry, recording);
        await queue.update(entry, { syncStatus: "synced", errorMessage: "", blocked: false, retryProcessing: false });
        return;
      }
      // An old failed pipeline is retried only by the existing explicit Retry action.
      if (recording?.processingStatus === "failed" && !explicitRetry) {
        await queue.update(entry, { syncStatus: "synced", errorMessage: "" });
        return;
      }
      if (!(await queue.hasAudio(entry))) throw Object.assign(new Error("The saved audio is missing or empty. Restore the file on this device and retry."), { code: "recording/local-file-missing" });
      if (!recording) {
        recording = await remote.create(entry);
        await queue.update(entry, { remoteDocumentSeen: true });
      }
      assertOwner(entry);
      if (completedUpload(recording) && !explicitRetry) {
        await queue.update(entry, { syncStatus: "synced", errorMessage: "", blocked: false });
        return;
      }
      if (!online()) return;
      await queue.update(entry, { syncStatus: "uploading", errorMessage: "", uploadAttemptStarted: true,
        generationBefore: object?.generation ?? null });
      assertOwner(entry);
      await upload(entry);
      // Durable receipt before any subsequent network operation. If this write
      // fails, the next run reconciles the Storage generation instead.
      await queue.update(entry, { uploadConfirmed: true });
      assertOwner(entry);
      await remote.receipt(entry, recording);
      await queue.update(entry, { syncStatus: "synced", retryProcessing: false, errorMessage: "", blocked: false });
    } catch (error) {
      const code = error?.code ?? "";
      const blocked = /permission|unauthor|unauthenticated|user-disabled|session-missing|local-file|deleting|id-conflict/.test(code);
      const failures = (entry.failures ?? 0) + 1;
      const transient = /network|unavailable|retry-limit|timeout|deadline|account-changed|no-current-user/.test(code) || !online();
      await queue.update(entry, { syncStatus: transient && failures < 5 ? "queued" : "error", blocked,
        failures, nextRetryAt: now() + Math.min(300000, 5000 * 2 ** Math.min(failures - 1, 6)),
        errorMessage: /permission|unauthor|user-disabled/.test(code)
          ? "You do not have permission to upload this recording. Sign in again or contact support. Your audio is saved on this device."
          : blocked ? error.message : transient && failures < 5 ? ""
            : "Upload failed. Your audio is saved on this device. Check your connection and retry upload." });
    }
  }

  function wake() {
    again = true;
    if (running) return running;
    running = (async () => {
      do {
        again = false;
        const uid = owner();
        if (!uid || !online()) break;
        for (const entry of queue.list(uid).slice().sort((a, b) => a.createdAt - b.createdAt)) {
          if (owner() !== uid || !online()) break;
          if (entry.syncStatus === "synced" || entry.blocked || entry.deletionPending || (entry.nextRetryAt ?? 0) > now()) continue;
          await synchronize(entry);
        }
      } while (again);
    })().finally(() => {
      running = null;
      // A save can arrive after the final queue snapshot but before this promise
      // releases its flight. Include that trigger in the returned work as well.
      if (again) return wake();
    });
    return running;
  }
  return { wake, idle: () => running ?? Promise.resolve() };
}
