# Recording deletion

## Flow and authorization

Session Details gives every saved attempt a separate accessible trash button and
uses the existing confirmation dialog. Cancel sends no request. Confirm locks
submission immediately, calls `deleteRecording({ sessionId, recordingId })` through
the existing Functions service in `us-central1`, and shows a deleting state.
Only acknowledged success removes the row and reloads session data. A failed or
ambiguous network response keeps the row with a retry message. Confirmed removals
are excluded from any stale cached refresh for the lifetime of that screen.

The backend resolves `users/{request.auth.uid}/sessions/{sessionId}/recordings/{recordingId}`.
IDs must be nonempty valid single document IDs. A client UID or audio path is never
used. Session ownership comes from that hierarchy (sessions do not normally have
a `userId` field); any explicit conflicting owner is rejected. Recording owner and
session fields must match. Legacy pending documents without those fields use their
existing authenticated hierarchy, as in the transcription implementation.

The callable first validates the saved `audioPath` (legacy `storagePath` fallback)
against exactly these two paths for the authenticated user and targeted recording:

```
recordings/{uid}/{sessionId}/{recordingId}.m4a
users/{uid}/sessions/{sessionId}/recordings/{recordingId}.m4a
```

It transactionally marks the recording `deleting: true`, deletes the exact saved
object in the existing default bucket outside the transaction, then atomically
deletes the recording document and updates session ratings. Missing metadata paths
use only those two derived exact paths; missing objects are successful cleanup.
Permission/service failures propagate as a safe callable error. There are no prefix
deletes, client-side cloud deletes, new collections, dependencies or processing statuses.

## Ratings and concurrent processing

The final transaction reads remaining attempts ordered by `createdAt` descending,
matching the screen's attempt ordering. Eligible records have `processingStatus:
completed` and a finite numeric `aiFeedback.overallRating` from 0 through 10.
`latestRating` is the first eligible rating, `bestRating` is the maximum and
`ratingSum` is the sum rounded to one decimal. An empty eligible set produces
`null`, `null`, and `0`. Zero ratings remain eligible. Unrelated session fields survive.

Analysis completion uses the same eligible-attempt selection for latest rating,
so a newer pending upload cannot keep an older rating after deletion. Its provider,
rubric, response parsing, metrics and once-only aggregate contribution are unchanged.
The shared session transaction coordinates completion and concurrent deletions.
An already-deleted recording returns success without updating aggregates again.

Transcription/metrics completion, analysis claims/success/failure, and analysis
retry check the recording deletion marker as well as document existence. These
handlers update existing documents; none recreates a deleted recording. Firestore
rules deny updates to marked recordings, including upload receipts and marker
removal. Storage rules deny their uploads. Client upload preparation also rejects
the marker. Existing session deletion retains its original implementation.

An upload already authorized before deletion can finalize late. The existing
Storage trigger removes that event's exact object generation when the recording
or session is absent/deleting. It makes no provider request in that case. Event
redelivery is enabled for cleanup failures and pre-provider claim database failures;
provider, transcript-save and metric failures retain their caught/manual-retry
behavior and generation claims. No new trigger, queue or scheduled job is introduced.
Late upload cleanup is asynchronous; the callable confirms removal of the current
object and metadata, and late-finalization recovery is handled by this trigger.

## Partial failures and local audio

Storage failure leaves the document, path, feedback and ratings available with the
marker. A final Firestore transaction failure can leave audio already removed, but
the document/path/marker remain and ratings are unchanged. Repeat Delete safely
finishes both cases. A session being deleted returns a precondition error directing
the user to finish session deletion. A missing parent returns not-found.

After cloud acknowledgement, the client calls the existing local-file utility in
an exact-mapping-only mode: it removes only a mapping that matches this recording's
canonical app-private `.m4a` file. Missing mappings are left alone; conflicting
mappings never delete another file. Local failure produces a separate message
that cloud deletion succeeded. Files on other devices are not removed. Offline
recordings retain their existing behavior; no offline deletion queue is added.

## Known limits

- `attemptCount` remains untouched because creation does not reliably maintain it.
  Session Details uses the loaded list length. Repair of count/average/progress
  semantics is deferred to the Progress milestone.
- Rating reconstruction reads the session's recordings, appropriate for the current
  app's session-sized collections. No pagination/index or large-scale cleanup system
  was added. Documents missing `createdAt` are outside the existing ordered-list contract.
- A provider request already in progress cannot be cancelled, but its result is
  discarded after deletion. Cleanup retries rely on delivery of the existing Storage
  event; permanent infrastructure failures still require operator recovery.
- Local file cleanup is best effort after confirmed cloud deletion and does not
  synchronize other devices or provide a new local cleanup queue.
- No separate API Architecture Summary artifact was found in the repository. The
  implementation follows the hierarchy and callable contract in the task and the
  inspected current services, rules and processor documentation.

## Deployment commands (not executed)

Run from the nested `SpeakSharp` app directory. Deploy the guards/rules before
making the new deletion callable available:

```powershell
firebase.cmd deploy --only "firestore:rules,storage,functions:transcribeRecording,functions:analyseRecording,functions:retryRecordingAnalysis" --project speaksharp-3893c
firebase.cmd deploy --only "functions:deleteRecording" --project speaksharp-3893c
```

The second command is the exact new-function deployment. Deploying only that
function without the first command omits processing and upload protections. Existing
regions and provider secrets remain unchanged. No deployment, IAM, billing, secret,
Git commit or push action was performed.

## Verification

- `npm.cmd test` in `functions`: 134 passed. Includes backend deletion, provider
  regressions, processor deletion guards, mocked actual component handlers, callable
  acknowledgement, duplicate taps, local-file mapping safety and offline errors.
- `npm.cmd run test:rules`: 16 passed using only the demo Firestore/Storage emulators.
  Includes real Storage deletion, duplicate/distinct concurrent delete transactions,
  deletion during mocked Deepgram/Gemini calls, late finalization cleanup, rules
  enforcement, existing session cascade and unchanged recording/analysis pipeline.
- `npx.cmd expo export --platform android --output-dir dist/recording-deletion-check`:
  Android/Hermes export passed, 1,560 modules, after permitting the bundled compiler
  to execute. `git diff --check` passed. No physical-device test was performed.
- UI tests use mocked hooks/native hosts and real screen/service code through the
  existing Babel installation. They do not replace rendering and interaction tests
  on a physical device. Providers are mocked; production resources were not tested.

## Expo Go and console checklist after deployment

1. Create/edit a session and record several attempts. Confirm upload, transcription,
   metrics, analysis and the existing Feedback view still work.
2. Cancel a recording deletion; confirm its document, audio and row remain. Confirm
   Delete once and tap repeatedly; verify the loading state and only that row disappears.
3. Check the exact Firestore document and its saved Storage path are gone; confirm
   sibling recordings/session fields are unchanged and the known local file is removed.
4. Delete the best, newest completed and final rated attempts. Compare saved remaining
   ratings with sum/best/latest, then confirm `0`/`null`/`null` when none remain.
5. Delete pending/failed and actively processing attempts. Wait for workers to finish;
   confirm no document, transcript, metrics or feedback is recreated.
6. Disconnect before Confirm: verify an understandable error, no success claim and
   preserved local file. Reconnect and retry; verify idempotent completion.
7. Verify another account cannot access/delete the recording; recheck session deletion.
   Use emulator fault tests for Storage/database outages rather than modifying live IAM.

## File inventory

Added: `functions/deleteRecording.js`, `functions/recordingDeletion.js`,
`functions/test/recordingDeletion.test.js`, `functions/test/recordingDeletionUI.test.js`,
`docs/recording-deletion.md`.

Modified: `functions/index.js`, `functions/analysisProcessor.js`,
`functions/transcriptionProcessor.js`, `functions/transcription.js`,
`functions/package.json`, `functions/test/analysis.test.js`,
`functions/test/transcription.test.js`, `functions/test/rules.test.js`,
`firestore.rules`, `storage.rules`, `services/processingService.js`,
`services/recordingService.js`, `storage/audioStorage.js`,
`components/screens/SessionDetailsScreen.js`, `components/ui/AttemptListItem.js`.
