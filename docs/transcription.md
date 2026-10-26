# Deepgram transcription phase

Implemented locally on 23 October 2026. Nothing has been deployed, migrated or committed. No secret values were read.

## Audit and contract

The supplied Database Design, API Architecture Summary, MVP Requirements and Screens/App Flow documents were inspected. The current request overrides their older callable-trigger and transcript editing/confirmation workflow.

- The actual Firestore hierarchy was already `users/{uid}/sessions/{sessionId}/recordings/{recordingId}`.
- `LocalRecordingScreen` persists accepted audio locally, creates the Firestore document, then opens `AttemptFlowScreen`. The upload uses `File.bytes()` with an existing native Blob fallback. That upload implementation, recorder hook, playback and accepted-file cleanup are retained.
- Previously, the document contained `duration`, `status: pending_upload` and timestamps. `storagePath` and `uploadedAt` were written **after** uploading to `users/{uid}/sessions/{sessionId}/recordings/{recordingId}.m4a`. This left the future Storage event racing the path update.
- The first indicator already used upload success. The second was inactive. Dead prototype branches still contained a simulated recorder timer, editable mock transcript and fixed AI scores; they were removed from `AttemptFlowScreen`. The actual recorder remains in `LocalRecordingScreen` and `useRecording`.
- Session Details always showed an empty recording list. It now lists real attempts using the existing `AttemptListItem`, so users can reopen processing/transcripts after leaving the screen or restarting.
- Cloud Functions use CommonJS, Node 22 and Firebase Gen 2. `deleteSession` remains in `us-central1`.
- A read-only Storage API request verified `speaksharp-3893c.firebasestorage.app` is a single-region bucket in **AFRICA-SOUTH1**. The new trigger uses `africa-south1` independently of the callable region.

New recordings use `processingStatus`, `durationSeconds`, `audioPath`, `userId` and `sessionId`. Their audio path is `recordings/{uid}/{sessionId}/{recordingId}.m4a`, prepared **before** upload. `uploadedAt` remains an upload receipt, not another lifecycle field. Existing fields such as notes, creation timestamps and future analysis are not overwritten.

Existing documents are normalized on read. A legacy pending document is upgraded only when that recording is explicitly uploaded again, or claimed by the backend: its existing duration/path values are copied to the canonical fields and the three legacy aliases are removed atomically. Existing audio stays at its original path. No bulk migration is required. Both paths are supported by the trigger, rules and deletion function. Older installed app versions must be updated alongside these rules; their old-format writes are no longer accepted.

Previously uploaded files do not automatically produce historical Storage events on deployment. Open a pending attempt and select **Retry Processing** using the device retaining the local audio. This creates a new object generation without creating another attempt.

## Files and dependencies

| File | Change |
| --- | --- |
| `functions/transcription.js` | New Gen 2 trigger, Secret Manager binding, bounded private audio download and SDK adapter. |
| `functions/transcriptionProcessor.js` | New ownership/eligibility validation, transactional claim, response validation and failure handling. |
| `functions/index.js` | Initializes Admin once and registers the new trigger alongside deletion. |
| `functions/deletion.js` | Marks deletion before removing audio; deletes canonical and legacy prefixes. |
| `functions/package.json`, `functions/package-lock.json` | Adds pinned `@deepgram/sdk@5.15.0`; removes unused `speaksharp_app: file:..` backend dependency; adds test commands. Firebase package versions are unchanged. |
| `services/recordingService.js` | Canonical metadata, lazy legacy compatibility, safe upload receipt, real-time subscription and safe UI error messages. |
| `services/audioUploadService.js`, `constants/recording.js` | Prepares the expected path before upload and attaches the recording ID for rule validation; retains the working byte/Blob transfer. |
| `components/screens/AttemptFlowScreen.js` | Real processing state and read-only transcript; removes conflicting mock transcript/AI branches. |
| `components/screens/SessionDetailsScreen.js` | Reopens saved attempts from the session. |
| `firestore.rules`, `storage.rules` | Protect generated fields and require owned, prepared, eligible documents for audio uploads. |
| `functions/test/transcription.test.js` | Mocked provider/Storage/Firestore failure scenarios and installed SDK request checks. |
| `functions/test/rules.test.js`, `firebase.test.json` | Isolated demo-project emulator rules, transaction and deletion regression tests. |

No frontend dependencies, public Firebase configuration or authentication logic were changed. No new collections, callable transcription endpoint, queues, scheduled jobs or AI provider were introduced.

## Backend behavior

1. A finalized `.m4a` object in the configured bucket must match one of the two supported recording paths.
2. A Firestore transaction checks the session exists and is not being deleted, validates ownership/path, and claims a pending recording. A failed recording can be reclaimed only for a strictly newer Storage generation. A recording already transcribing, transcript-ready, analysing or completed is skipped. Delayed older events are also skipped.
3. The claim stores `processingStatus: transcribing`, `transcriptionJob: { generation, startedAt }` and an upload receipt. Generated metadata is server-managed.
4. Validate the declared integer duration (1–900 seconds), nonempty size up to **32 MiB**, and m4a MIME type. At the current Expo HIGH_QUALITY preset's 128 kbps, 15 minutes is about 14.4 MB before small container overhead. Admin reads the exact private object generation with a 45-second download deadline and byte limit; it checks the MP4 `ftyp` header. No public or signed download URL is created.
5. SDK v5 uses `new DeepgramClient({ apiKey })` and `client.listen.v1.media.transcribeFile(buffer, options, requestOptions)`. All requested parameters are sent: `model: nova-3`, `language: en`, `smart_format: true`, `filler_words: true`, `mip_opt_out: true`, `diarize: false`. The provider timeout is 180 seconds and SDK retries are disabled. No cleaning, translation, conversion or metrics calculation is performed.
6. The primary transcript must be a nonempty string. Silence is `failed / no_speech`, not a usable transcript. Provider-reported audio duration is also checked against the limit with one second of container rounding tolerance. Compact `{ word, start, end }` entries are kept under `transcript.words` when valid. Oversized word data is omitted; oversized text fails. Raw provider responses are not stored.
7. A final transaction checks the session/recording and claim again, then writes the transcript map and `transcript_ready` together. It uses `update`, never recreating deleted documents. Future analysis can use that status transition automatically.
8. Failures persist `processingStatus: failed` and `processingError: { stage, code }` where Firestore is available. Logs contain IDs, generation and safe codes; they do not contain transcripts, credentials, raw responses or authorization headers. Audio is retained.

Runtime limits: 512 MiB, fractional `gcf_gen1` CPU, concurrency 1, max instances 2, min instances 0, function timeout 300 seconds, event retries disabled. These bound concurrent cost without additional infrastructure beyond the normal Gen 2 Storage trigger.

### Retry and crash limits

Normal duplicate events do not make another paid request. Manual retry re-uploads the retained local audio and creates a newer generation; clients cannot reset the lifecycle themselves. Retry therefore requires the original device/local file. No automatic retries or retry loops are added.

Exactly-once external billing is not guaranteed across a process crash or an ambiguous provider response. If the process crashes, the secret prevents startup, or Firestore remains unavailable even when saving failure, the record may remain pending/transcribing. There is intentionally no automatic lease takeover that might repeat billing. An administrator should inspect logs and Deepgram usage, ensure the five-minute invocation has ended (allow at least ten minutes), and mark a genuinely stuck attempt `failed` with `processingError: { stage: "transcription", code: "interrupted" }` using trusted console/Admin access. Preserve `transcriptionJob.generation`; the user can then explicitly retry. Do not reset a running or successful job. This recovery has not been performed on production data.

A deletion that begins after a provider request has started cannot cancel its billing. It does block saving results and recreating deleted documents. A failed cascade keeps `deleting: true` so the user can retry session deletion safely.

## Frontend state

The existing upload operation still completes step one. An `onSnapshot` listener on the selected recording drives step two:

| Firestore status | UI |
| --- | --- |
| `pending_upload` | Waiting for upload/processing. |
| `transcribing` | Transcription spinner. |
| `transcript_ready` with actual nonempty text | Success check and selectable read-only transcript. |
| `failed` | Safe error message and explicit retry. |

The listener unsubscribes on unmount. A component key resets state when recording/session IDs change and mounted guards prevent prior uploads from updating a different screen. Re-entry reads the current document and skips uploads already acknowledged. No timer, percentage or mock result completes transcription. The metrics/feedback indicators stay unavailable; there is no transcript editing, confirmation or navigation to fabricated scores.

## Verification performed

- **43 Node tests passed:** successful processing, concurrent/duplicate/older events, all terminal/in-progress states, legacy compatibility, missing/deleting parents, ownership/path mismatches, invalid duration/size/type/header, missing audio/secret, provider authentication/credits/rate limits/network/timeout, silence/invalid responses, deletion during work, Firestore failures, document-size budget and SDK request/transport behavior.
- **10 emulator tests passed:** real Firestore and Storage rules enforce ownership/generated-field protection, allow the upload-receipt race, support legacy preparation, block invalid/oversized/unlinked uploads and overwrites during processing, and protect deletion markers. Real Admin transactions deduplicate concurrent handlers with a mocked provider. The actual deletion handler removes both Storage layouts and child documents, retaining authentication and ownership checks.
- Android/Hermes export passed: `npx.cmd expo export --platform android --output-dir dist/transcription-check` (1,555 modules). The initial sandbox attempt could not execute Hermes; rerunning with compiler execution permission succeeded.
- Backend module registration and dependency tree checked; JavaScript/JSX parsing and whitespace checks passed.
- `npm audit` reports two moderate advisories in the existing Google/Firebase transitive `gaxios`/`uuid` chain. No unrelated dependency upgrades or audit fixes were applied.

No live Deepgram call, deployed Storage event, real-device UI test, login/email flow or device recording/playback/offline restart was executed. Emulator tests do not prove production IAM, Eventarc delivery, audio accuracy or native behavior.

Reproduce checks (Node 22; Java 21+ and Firebase CLI for emulators; install the app's existing dependencies too):

```powershell
cd C:\Users\armof\OneDrive\Documents\1UNIVERSITY\ASSIGNMENTS\SpeakSharp\SpeakSharp
npm.cmd --prefix functions ci
npm.cmd --prefix functions test
npm.cmd --prefix functions run test:rules
npx.cmd expo export --platform android --output-dir dist/transcription-check
```

The emulator tests use only `demo-speaksharp` and refuse to run unless both emulator endpoints are local. A portable checksum-verified Temurin Java 21 runtime was used from the temporary directory during this session; no system Java installation was changed.

## Deployment and setup (not executed)

Run from the inner app directory above. Review all infrastructure/IAM changes before running them.

### Read-only checks

```powershell
gcloud storage buckets describe gs://speaksharp-3893c.firebasestorage.app --project=speaksharp-3893c --format="yaml(name,location,locationType)"
gcloud secrets versions describe latest --secret=DEEPGRAM_API_KEY --project=speaksharp-3893c
gcloud secrets get-iam-policy DEEPGRAM_API_KEY --project=speaksharp-3893c
gcloud projects get-iam-policy speaksharp-3893c
gcloud storage buckets get-iam-policy gs://speaksharp-3893c.firebasestorage.app
```

Observed: bucket `AFRICA-SOUTH1`; secret version 1 `ENABLED`; existing Node 22 deletion runtime service account `1024863582729-compute@developer.gserviceaccount.com`. Its direct project grants include `roles/datastore.user` and `roles/storage.objectViewer`. No matching direct secret-access, Storage deletion, Eventarc receiver or Storage-agent Pub/Sub publisher grants appeared in the inspected project/bucket/secret policies. Inherited organization grants were not audited.

`defineSecret` binds the existing secret only to `transcribeRecording`. The Firebase deployment should grant that runtime access to the existing secret; if permission setup is required, use the **secret-level** grant below. Do not print/access the secret value or create an Expo environment variable.

```powershell
gcloud secrets add-iam-policy-binding DEEPGRAM_API_KEY --project=speaksharp-3893c --member="serviceAccount:1024863582729-compute@developer.gserviceaccount.com" --role="roles/secretmanager.secretAccessor"
```

For direct Storage events, verify Eventarc/Pub/Sub APIs and the following documented trigger grants. The CLI may arrange these during first deployment; apply missing grants only after review:

```powershell
gcloud projects add-iam-policy-binding speaksharp-3893c --member="serviceAccount:service-1024863582729@gs-project-accounts.iam.gserviceaccount.com" --role="roles/pubsub.publisher"
gcloud projects add-iam-policy-binding speaksharp-3893c --member="serviceAccount:1024863582729-compute@developer.gserviceaccount.com" --role="roles/eventarc.eventReceiver"
```

The Eventarc delivery identity also needs `roles/run.invoker` **on the generated transcription Cloud Run service**, normally configured by Firebase deployment. Never make the transcription service public to solve an event-delivery error.

The new Storage rules use `firestore.get`. Accept/review Firebase's narrowly scoped cross-service permission prompt during rules deployment; this allows the Storage rules service agent to check recording/session documents. Authentication and UID ownership remain required. The lookups add up to two Firestore document reads per upload authorization.

Session deletion requires object deletion/listing in the bucket in addition to the runtime's existing read access. If effective IAM confirms these are missing, a bucket-scoped `roles/storage.objectUser` grant supplies them (including object write permissions). Prefer an existing narrower custom deletion role if the project has one:

```powershell
gcloud storage buckets add-iam-policy-binding gs://speaksharp-3893c.firebasestorage.app --member="serviceAccount:1024863582729-compute@developer.gserviceaccount.com" --role="roles/storage.objectUser"
```

### Targeted deployment order

```powershell
npm.cmd --prefix functions ci
firebase.cmd deploy --only "firestore:rules,storage" --project speaksharp-3893c
firebase.cmd deploy --only functions:deleteSession --project speaksharp-3893c
firebase.cmd deploy --only functions:transcribeRecording --project speaksharp-3893c
```

The last command deploys **only the new function**. The separate deletion update is required to clean the new canonical prefix and coordinate deletion with processing. Deploying transcription alone without the updated rules/deletion handler is insufficient. After these changes, run the updated app; no all-functions deployment or database migration is needed.

Inspect deployment and logs without exposing audio or secrets:

```powershell
gcloud functions describe transcribeRecording --gen2 --region=africa-south1 --project=speaksharp-3893c --format="yaml(state,eventTrigger,serviceConfig.serviceAccountEmail,serviceConfig.secretEnvironmentVariables)"
firebase.cmd functions:log --only transcribeRecording --project speaksharp-3893c
```

## Practical manual checklist

1. Sign in, create/edit a session, record 20–30 seconds including an intentional filler such as “um”, pause/resume, stop, replay, then accept. Step one should finish after the actual upload.
2. In Storage, verify `recordings/{uid}/{sessionId}/{recordingId}.m4a`, `audio/mp4`, nonzero size, and custom metadata `recordingId`. Do not make it public.
3. In the exact Firestore recording, watch `processingStatus: transcribing`, then `transcript_ready`, with real spoken text at `transcript.originalText` and optional compact words. For a very short clip the intermediate state can finish before the console refreshes. Confirm duration, IDs, path and existing fields remain intact; no `status`, metrics or fabricated analysis are created.
4. In SpeakSharp, the second spinner must finish from that update. Confirm a read-only transcript, two unavailable future steps and no confirmation button or AI score. Leave/reopen the attempt from Session Details, including after restarting the app.
5. Check function logs for the safe recording/generation success entry. In Deepgram usage/logs confirm Nova-3, the request's MIP opt-out, and no extra request just from reopening the screen. Do not deliberately repeat paid tests unnecessarily.
6. Try a silent clip: expect `failed / no_speech`, retained local/cloud audio and a useful message. Provider-outage/credential failure paths were mocked; test live only through controlled test credentials/projects, not by disabling the production secret.
7. Disconnect before upload or interrupt an upload; reconnect and use Retry. Confirm the retained local recording uploads without another recording session. Check existing recording pause/resume/playback and accepted-audio cleanup on the device.
8. Delete a disposable session containing old/new audio paths while processing. Confirm the child documents/audio are removed and no result recreates them. Verify another user's account cannot read/write it. Recheck ordinary authentication, session CRUD and navigation on the device.

## Next phase

Use the atomic transition to `transcript_ready` to begin automatic speaking metrics/AI analysis. This phase does not set `analysing` or `completed`, calculate scores, update rating summaries, add transcript confirmation or implement AI feedback. Formal attempt-number/summary maintenance remains outside this transcription change; Session Details counts the actual fetched recordings for display.

## Official references checked

- [Expo SDK 57 reference](https://docs.expo.dev/versions/v57.0.0/)
- [Official Deepgram JavaScript SDK and v5 file API](https://github.com/deepgram/deepgram-js-sdk)
- [Deepgram prerecorded API](https://developers.deepgram.com/reference/speech-to-text/listen-pre-recorded)
- [Deepgram model improvement opt-out](https://developers.deepgram.com/docs/the-deepgram-model-improvement-partnership-program)
- [Firebase Storage triggers and location](https://firebase.google.com/docs/storage/extend-with-functions)
- [Firebase function secret binding](https://firebase.google.com/docs/functions/config-env)
- [Storage rules Firestore access and permission setup](https://firebase.google.com/docs/storage/security/rules-conditions)
- [Cloud Storage Eventarc delivery permissions](https://docs.cloud.google.com/run/docs/tutorials/eventarc)
