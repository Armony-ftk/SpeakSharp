**Offline recording and automatic synchronization — 1 November 2026**

The feature is implemented locally. The physical iPhone acceptance journey and live provider processing have not been executed in this session.

**Root cause**

`LocalRecordingScreen` copied accepted audio to documents, but then awaited `createRecording()` in Firestore before accepting or navigating. Its error handler deleted the persistent copy when that network-dependent step failed. The remaining cache recording was owned by the recorder's unmount cleanup. Other screens only read Firestore, and upload execution belonged to `AttemptFlowScreen`; there was no durable metadata queue or application-level reconnect worker.

**Save and synchronization**

- The existing recorder options, cache recording format, controls and 900-second limit remain in place. On acceptance, its source is protected from unmount cleanup.
- A stable Firestore-style ID is generated locally once. An account-scoped AsyncStorage entry journals the source URI, deterministic document URI, byte length, duration, original local save time and minimal parent-session display information before copying audio.
- Audio is copied to `Paths.document/SpeakSharp/recordings/{recordingId}.m4a`. The file must be nonempty and match the source byte length. URI mappings and queue writes are serialized. Metadata contains no audio bytes or base64.
- Only a successful persistent copy, URI mapping and ready metadata write accept the recording. Navigation follows the existing processing route. Local failures keep the screen and retain valid audio/journal information for retry or restart recovery.
- Startup recovery can finish a journaled copy, replace a partial copy, rebuild its mapping or expose a retained-file error. A corrupt metadata entry does not prevent restoring other valid entries.
- One synchronization coordinator is mounted through the existing keyed `AccountDataProvider`. Existing NetInfo and AppState APIs trigger it after restoration, saves, reconnection, foregrounding and manual retry. There are no background tasks or new dependencies.
- Network state is only a scheduling hint. Server-only session/document reads and Storage metadata reads establish actual remote state. Permission/read failures are never treated as nonexistent data.
- The worker processes recordings serially, oldest local save first. Repeated triggers share its running promise. It checks ownership after asynchronous work, verifies the parent session, creates an absent document transactionally and uses the original `uploadRecordingAudio()` implementation.
- Before a new upload, it reconciles `uploadedAt`, advanced processing status, persisted transcript, Storage object existence and the durable upload checkpoint. An interrupted explicit transcription retry also compares Storage generations. Automatic recovery never resets backend status or overwrites an already uploaded object.
- The upload receipt is checkpointed locally before subsequent network operations. Backend processing remains entirely in the existing Storage-triggered transcription, metrics and Gemini pipeline.
- A synchronized local entry remains as a durable UI handoff until the shared Firestore listener contains that ID. Acknowledgement cannot remove a newer retry or deletion intent. Persistent audio remains available through the original mapping for existing explicit retry behavior.
- Retries use bounded foreground backoff. After repeated connection failures, an Upload failed / Retry state is shown. Permission, missing-file and missing/deleting-session failures retain the audio and require an explicit retry. Signing out retains the owner's queue and files; another account cannot display or synchronize them.
- Confirmed deletion pauses queued uploads and waits for an active upload to settle before using the existing callable. A durable deletion intent prevents restart recovery from recreating an attempt after an ambiguous deletion outcome. Cleanup errors are reported separately from confirmed cloud deletion.

**UI and data contracts**

Home, Sessions, Session Details, Progress and the processing screen consume merged data through the existing shared account provider. Pending attempts are deduplicated against Firestore by recording ID. Minimal local session information makes their parent visible even when Firestore has no cached session after a cold restart. Pending states show `Waiting for upload/transcription`; an offline connection never activates the upload spinner. Completed feedback and stage-specific retry controls keep their existing implementation.

`calculateProgress()` and its completed/rated/dated eligibility rules were not modified. Local attempts have no invented feedback or metrics. They affect deduplicated attempt totals, with no contribution to ratings, fillers, pace or the four-eligible-recording 2-versus-2 comparison.

Current creation rules do not accept an `attemptNumber` field; existing new recordings are numbered by display order. The merged list uses chronological numbering and deduplicated counts. No aggregate counters are written by the queue. Firestore `createdAt`/`updatedAt` remain server timestamps as required by the existing rules: pending local entries show their original local save time, while the remote document's creation time is its synchronization time. Preserving the original capture time remotely across devices would require a separate schema/rules change and was not added.

No production Cloud Functions, Firestore schema, security rules, SDK versions or dependencies were changed. The existing authentication, verification, analysis rubric, shared listener ownership and canonical paths remain in place. The separate unresolved Storage/media suspension-security audit in [account-suspension-security.md](account-suspension-security.md) remains applicable.

**Files changed for this feature**

| File | Purpose |
| --- | --- |
| `storage/audioStorage.js` | Serialize URI-map changes, validate persistent copies and retain audio when metadata writes fail. |
| `storage/recordingQueue.js` | Durable account-scoped metadata, save journal, restoration, file repair and deduplicated merges. |
| `utils/recordingSyncWorker.js` | Single-flight reconciliation, checkpoints, bounded retry and failure classification. |
| `services/recordingSyncService.js` | Existing Firebase contract adapters, ownership checks, centralized retry and deletion coordination. |
| `hooks/useRecordingQueue.js` | One startup/network/foreground queue lifecycle and foreground backoff timer. |
| `hooks/useRecording.js` | Protect the recorder source during asynchronous local acceptance; retain existing audio controls and duration limit. |
| `services/audioUploadService.js` | Check the expected owner around asynchronous upload preparation and native file reads; preserve the byte/XHR uploader. |
| `hooks/useProgress.js` | Expose existing raw listener data to the shared provider without adding listeners or changing calculations. |
| `context/AccountDataContext.js` | Merge local attempts and minimal sessions with remote data; acknowledge synchronized handoffs. |
| `components/screens/LocalRecordingScreen.js` | Save locally before navigation and use shared session fallback while offline. |
| `components/screens/AttemptFlowScreen.js` | Render shared local waiting/upload/error states and delegate all upload/retry work to the coordinator. |
| `components/screens/SessionDetailsScreen.js` | Show live merged attempts, dates, durations and counts; coordinate deletion with the queue. |
| `components/screens/SessionsScreen.js` | Use shared merged session data and expose local persistence errors. |
| `components/screens/HomeScreen.js` | Keep pending local sessions accessible when cloud history cannot load; preserve existing unrelated edits. |
| `components/screens/ProgressScreen.js` | Keep local attempt totals visible with an explicit cloud-load error instead of hiding pending attempts. |
| `tests/offlineRecordings.test.cjs` | Persistence, crash, account, synchronization, canonical adapter, lifecycle and recorder-control tests. |
| `tests/attemptFlowPresentation.test.cjs` | Preserve stage-transition regressions; add local waiting, reconnect, failure and deletion-state rendering. |
| `functions/test/accountData.test.js` | Update frontend dependency fixtures and verify shared local-to-remote handoff across consumers. |
| `functions/test/recordingDeletionUI.test.js` | Update frontend queue fixtures while retaining deletion regressions. |
| `package.json` | Add `test:offline`; dependency versions are unchanged. |
| `docs/offline-recordings.md` | Implementation, verification evidence and device procedure. |

**Verification performed**

| Check | Result |
| --- | --- |
| `npm.cmd run test:offline` | 37/37 passed: native APIs/network/Firebase are mocked. |
| `npm.cmd test` inside `functions` | 159/159 passed, including shared account data, completed feedback/progress, processing and deletion regressions. |
| Node tests in `functions/*.test.js`, excluding emulator tests | 110/110 passed: admin authorization, suspension, directory/activity and session deletion. |
| `node --test services/operationId.test.js services/accountStatusOperationStore.test.js functions/test/recordingDeletionUI.test.js` | 17/17 passed. Seven deletion cases overlap the Functions suite. |
| `npm.cmd run test:rules` | 28/28 passed using only `demo-speaksharp`, local Firestore/Storage emulators and cached Java 21. Expected permission denials are negative assertions. |
| Targeted Jest run over admin screens, AuthContext, adminService and adminDemo | Six suites passed, 55/55 executed tests passed. `tests/adminDemo.test.js` failed to initialize because its existing `app/admin/_layout.js` import lacks a native AsyncStorage mock. |
| `npx.cmd expo export --platform ios --output-dir .tmp-offline-ios-export` | iOS Hermes export passed after permitting the local compiler. |
| `git diff --check` | Passed. |
| `npx.cmd expo install --check` with network access | Reports existing patch recommendations: Expo `58.0.21` to `~58.0.22`, expo-audio `58.0.10` to `~58.0.11`, expo-router `58.0.28` to `~58.0.29`. No packages changed. The earlier offline-mode dependency check is not the authoritative result. |

Earlier broad Jest discovery incorrectly included Node-runner suites and was discarded. An earlier targeted run timed out in two admin UI tests under concurrent checks; both passed in the final correctly scoped run. No unrelated admin code/tests were changed to address these observations. The known suspension-security acceptance audit was not rerun or declared resolved.

Automated coverage includes three offline saves, navigation acceptance ordering, restart restoration, repeated taps, unmount during save, local write/copy failure, partial-file recovery, online/offline reconnect, overlapping triggers, upload failure/backoff/retry, interrupted document/upload/receipt work, Storage generation reconciliation, advanced-status protection, durable UI handoff, canonical paths/fields, account switching, permissions, deleted/deleting parents, missing files, stale acknowledgements, deletion intents, original recorder controls and the 900-second limit. These are mocked/local checks; physical playback, OS lifecycle and real provider completion remain unverified.

**Exact Expo Go iPhone verification**

1. In the nested app directory, run `npx.cmd expo start --offline`. This flag allows the LAN development server to run without external internet; it does not simulate an offline phone. Keep this terminal open. Use the existing SDK 58-compatible Expo Go installation, connect the iPhone and computer to the same LAN, open the QR code, sign in to a verified account and open an existing session while internet is available. Do not uninstall Expo Go or clear project data during this test.
2. Enable airplane mode and turn Wi-Fi off. Record at least 20 seconds of clear speech. Exercise pause/resume, stop, and review playback. Select **Use This Recording**; tap twice quickly on the first attempt. Confirm it opens the normal processing route and displays **Waiting for upload/transcription**, with no upload spinner while offline.
3. Select **Back to Session**, then **Record an Attempt** twice more. Save three distinct recordings total. Confirm all three rows have distinct numbers, correct durations and local save times. Visit Home, Sessions, Progress and Profile, return to the session and open each pending attempt. Verify there is no feedback for them and no fabricated rating/metrics contribution.
4. Swipe Expo Go away in the iPhone app switcher while still in airplane mode. Reopen the same project. If Expo Go can bootstrap it from its available project cache, verify all three attempts remain. If Expo Go requires Metro before SpeakSharp can run, do not count that bootstrap failure as a queue test: leave cellular disabled, re-enable only Wi-Fi on a LAN with its WAN/internet disconnected, and open the local Metro project. Confirm Safari cannot reach an external site while Metro remains reachable. Fully close/reopen Expo Go again in that LAN-only condition and verify all three attempts. Expo Go loads development JavaScript from Metro; a completely networkless cold launch must additionally be tested using an installed build with an embedded bundle. [Expo CLI documentation](https://docs.expo.dev/more/expo-cli/)
5. Restore the LAN's internet connection (or leave airplane mode and reconnect). Keep SpeakSharp foregrounded. Without pressing Retry, observe each attempt upload and then progress through transcription, metrics and AI feedback. Navigate to other tabs and foreground the app during processing. Confirm each attempt remains listed exactly once.
6. Open all three completed attempts. Confirm persisted feedback, real metrics and rating displays. Confirm shared Home/Profile counts and Progress eligibility update from actual Firestore data. Use a read-only Firebase Console inspection to confirm three recording documents under the original session and one canonical Storage object per recording. Record each object's generation; reopen/foreground/reconnect the app again and verify those generations do not change from another frontend upload. Check provider/backend logs read-only if verifying external processing counts.
7. Save one further recording online and confirm the original flow completes. On disposable test attempts, exercise upload interruption by disconnecting during transfer, then close/reopen and reconnect; verify recovery without another document ID or overwriting an object already confirmed uploaded. Exercise existing AI Retry only on a legitimate failure/stall; do not manufacture a production failure.
8. While recordings are queued offline, sign out, sign into a different test account while online and verify the original queue is absent. Sign back into the rightful account and verify it resumes. Test session rename/status changes and confirmed recording/session deletion on disposable data; failures must retain local audio and expose the appropriate recovery message.
9. Verify a 15-minute recording still stops automatically on the physical device. The automated hook test verifies the unchanged 900-second limit, but does not substitute for native timing/playback checks.

No commits, pushes, merges, deployment, production test writes or backend/rules changes were performed. Generated local test logs and the iOS export are retained under ignored `dist/offline-recordings-checks/`.
