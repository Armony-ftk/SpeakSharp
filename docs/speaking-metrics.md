# Objective speaking metrics

Milestone 2 connects the existing pure calculator to `transcribeRecording` and the
existing processing screen. The standalone development preview remains read-only.
No function export, dependency, listener, processing status or AI feedback was added.

## Existing contract

The backend is Node 22/CommonJS under `functions/`, with Firebase Admin and Node's
built-in test runner. Recording creation uses
`users/{userId}/sessions/{sessionId}/recordings/{recordingId}` with `durationSeconds`
and `processingStatus`. Transcription stores `transcript.originalText`. Sessions
store optional `targetDurationSeconds`. New recordings do not initialize `metrics`;
the backend now adds only the calculated fields after saving the transcript. The requested
DOCX reference files were not available in this workspace.

## Pure calculation

```js
const { calculateSpeakingMetrics } = require("./speakingMetrics");
const metrics = calculateSpeakingMetrics({
  originalText: "Um, actually I like this. You know, it works.",
  durationSeconds: 40,
  targetDurationSeconds: 40,
});
```

Returns `durationSeconds`, `wordCount`, `wordsPerMinute`, `fillerWordCount`,
`fillerBreakdown`, and `targetDurationStatus`.

- Duration is the supplied finite, nonnegative number, without rounding or audio
  inspection. Missing, negative, nonnumeric, or nonfinite duration becomes `null`.
  Numeric strings are not coerced. Zero remains zero.
- Words are runs of Unicode letters/numbers (including combining marks), with
  internal straight/curly apostrophes preserved. Punctuation, hyphens and whitespace
  separate words. Numbers count as words; punctuation alone does not.
- WPM uses total recording time, including silence, rounded to one decimal. Zero,
  unknown duration or numeric overflow returns `null`, never Infinity or NaN.
  Empty text with positive duration gives zero words and zero WPM.
- Fillers are case-insensitive complete tokens: `um`, `uh`, `like`, `basically`,
  and adjacent `you know` tokens. `actually` is intentionally excluded, as confirmed
  for Milestone 2; the calculator itself is unchanged. Punctuation/line breaks between `you`
  and `know` are ignored. Each phrase counts once. Only detected fillers appear in
  the breakdown, and its sum is the total.
- A finite positive numeric target uses inclusive 90%-110% boundaries for `close`;
  below is `under`, above is `over`. Missing/invalid target or unknown actual
  duration gives `null`. A known zero actual duration is `under` a valid target.
- Missing/nonstring transcript throws a clear error, rather than treating missing
  transcription as silence. An explicitly empty string is supported.

This is basic English token matching: meaningful uses of "like" and "basically"
also count, and fillers omitted by transcription cannot be recovered. Languages
without spaces are not segmented linguistically. No subjective scores are produced.

## Local tests

From the nested application root:

```powershell
cd "C:\Users\armof\OneDrive\Documents\1UNIVERSITY\ASSIGNMENTS\SpeakSharp\SpeakSharp\functions"
npm.cmd run test:metrics
npm.cmd test
```

The focused tests cover calculations and a mocked read-only Firestore preview;
the full command also runs the existing transcription tests with mocked providers.
Neither calls Deepgram or creates real recordings. No new dependencies are needed.
If backend dependencies are absent, run `npm.cmd ci` in `functions` first.

The sample above now yields duration 40, word count 9, WPM 13.5, filler count 3,
breakdown `{ um: 1, like: 1, "you know": 1 }`, target status `close`.
The two outdated tests expecting `actually` were aligned with the confirmed behavior.

Milestone 2 verification:

- `npm.cmd test` in `functions`: 78 passed, 0 failed (calculator, read-only preview,
  transcription/metrics integration and frontend progress predicates).
- `npm.cmd run test:rules` in `functions`: 10 passed, 0 failed, using only the
  `demo-speaksharp` Firestore/Storage emulators and mocked Deepgram. This includes
  real transaction persistence, nested-map preservation, duplicate-event handling
  and rejection of client metric edits. Java 21 must be on the terminal's `PATH`;
  this machine used its existing temporary `speaksharp-java21` runtime and cached
  emulator JARs. Initial sandbox/Java-path startup failures were resolved.
- `npx.cmd expo export --platform android --output-dir dist/metrics-integration-check`
  in the app root: Android/Hermes export passed (1,556 modules), after allowing the
  bundled compiler to run. The final attempt-list label edit was also syntax checked.
- `git diff --check` passed. No live provider request, production write, deployment,
  or device end-to-end test was performed.

## Automatic persistence and processing UI (Milestone 2)

`functions/transcriptionProcessor.js` still claims each Storage generation before
the existing download/Deepgram request. It saves the transcript and
`processingStatus: transcript_ready` in the existing transaction first. Only after
that commit does another guarded transaction call `calculateSpeakingMetrics` with
the saved `transcript.originalText`, top-level `durationSeconds`, and the current
parent session's optional `targetDurationSeconds`. Reads needed for the existing
ownership/deletion/generation guards also supply these inputs.

The metrics transaction updates these exact field paths atomically:

- `metrics.wordCount`
- `metrics.wordsPerMinute`
- `metrics.fillerCount` (calculator's `fillerWordCount`)
- `metrics.fillerWords` (calculator's `fillerBreakdown` map)
- `metrics.targetDurationStatus`

It also updates the existing `updatedAt` timestamp and clears `processingError`.
Dot-path updates preserve unrelated metrics such as `uniqueWords` or `pauses`;
they never invent those values or duplicate `durationSeconds`. No transcript,
audio path, note, creation timestamp, or session field is modified by this step.

Successful lifecycle remains `pending_upload -> transcribing -> transcript_ready`.
Metrics do not set `analysing` or `completed`. `AttemptFlowScreen` uses its existing
`subscribeToRecording` listener and the small `utils/metricsProgress.js` predicate:
the third step is active for a saved transcript at `transcript_ready` while metrics
are absent/invalid, and complete only when all five persisted canonical fields are
valid (including matching filler total/breakdown). A null target classification is
valid; a missing classification is incomplete. Zero counts and an empty filler map
are valid. No timeout completes a step. AI feedback stays inactive and says
"AI feedback not started". The transcript remains read-only and visible.
The session attempt list uses the generic label "Processing failed" so a metrics
failure is not mislabeled as a transcription failure; session CRUD is unchanged.

The additional successful metrics transaction costs two document reads and one
recording update, excluding Firestore transaction retries. Its pure calculation
may run again if Firestore retries that transaction; Deepgram is outside it and is
not called again. The Storage generation/status guards still reject duplicate,
out-of-order, already transcribed and deleted attempts, including metrics failures
that already have a saved transcript. There is no historical reprocessing support.

### Failure behavior and remaining retry limitation

Calculation failure records `failed` with
`processingError: { stage: "metrics", code: "metrics_calculation_failed" }`.
Persistence failure records `failed` with
`processingError: { stage: "metrics_saving", code: "database_unavailable" }` where
Firestore is available. Logs contain only recording ID, generation, stage and safe
code; neither transcript nor raw error text is logged. Both paths retain saved
transcript, audio and unrelated fields. The UI shows transcription success, a
metrics error, and no transcription retry button. The upload entry point also
refuses to re-upload an attempt with a saved transcript.

If Firestore is unavailable even for the failure update, or execution stops after
the transcript commit, the document can remain `transcript_ready` without metrics.
The UI then remains pending, never falsely successful. An administrator must inspect
the logs. There is no automatic metrics-only retry or recovery endpoint in this
milestone. Older transcript-only attempts likewise receive no backfill; use a new
recording for verification.

### Deployment and fresh-recording verification

From the nested application root, after reviewing local checks:

```powershell
firebase.cmd deploy --only functions:transcribeRecording --project speaksharp-3893c
npm.cmd start
```

Only the existing `transcribeRecording` export needs deployment. `deleteSession`,
function configuration/secrets, client rules, and dependencies are unchanged.
No deployment is performed by the implementation or tests.

1. Open the updated app and a practice session; optionally set a target duration.
2. Record a short new presentation with a known filler, then select Use This Recording.
3. Confirm Uploading and Transcribing still progress, then Calculating Metrics
   completes. Fast calculation may skip the visible spinner; no delay is added.
4. AI feedback must remain inactive. The transcript stays visible; reopening the
   attempt must show metrics complete without uploading or transcribing again.
5. In `users/{uid}/sessions/{sessionId}/recordings/{recordingId}`, compare the five
   metrics fields with the saved transcript and top-level duration. Confirm status
   remains `transcript_ready`, other fields are intact, and no fabricated metrics,
   AI result, rating, or duplicate duration was added.
6. Check safe logs with
   `firebase.cmd functions:log --only transcribeRecording --project speaksharp-3893c`.

Automated tests use mocked Deepgram responses. They do not establish deployed
provider, device UI, or production Firestore behavior; the fresh-recording manual
test above remains required after deployment.

## Read an existing Firestore recording

Use an account with existing Firestore IAM read access to the selected project.
For least privilege, a project administrator can provide `roles/datastore.viewer`
or a suitable custom read role. Admin SDK access is governed by IAM; do not weaken
client Firestore rules. No IAM changes are made by this script.

If Application Default Credentials (ADC) are not already configured, install the
[Google Cloud CLI](https://cloud.google.com/sdk/docs/install), then authenticate
locally following [Google's ADC instructions](https://cloud.google.com/docs/authentication/set-up-adc-local-dev-environment):

```powershell
gcloud.cmd auth application-default login
gcloud.cmd auth application-default set-quota-project speaksharp-3893c
```

Setting a quota project requires `serviceusage.services.use` on it. If denied, use
an administrator-approved quota project/access; do not bypass permissions. Firebase
CLI login alone is not the Admin SDK ADC configuration. Existing supported
`GOOGLE_APPLICATION_CREDENTIALS` configuration is also honored; do not copy keys
into this repository or use Expo public configuration as Admin credentials.
See [Firestore IAM documentation](https://cloud.google.com/firestore/native/docs/security/iam).

From `functions`, replace the three IDs with those of an existing transcribed
recording in Firebase Console:

```powershell
npm.cmd run metrics:preview -- speaksharp-3893c "USER_ID" "SESSION_ID" "RECORDING_ID"
```

The explicit project argument avoids relying on an implicit CLI project. If
`FIRESTORE_EMULATOR_HOST` is set, the Admin SDK uses that emulator and output is
labeled `emulator`; unset it when intentionally testing the real project. This
script does not enumerate other recordings, create fixtures, download audio,
load function handlers, call Deepgram, or update any document. Missing documents,
missing transcripts and access failures exit nonzero with a clear message.

Output contains project/source, recording identifiers, calculated metrics, and
`sourceDocumentsUnchanged: true`. It never prints the transcript or whole documents.

## Verify source documents stay unchanged

The script reads only the two specified documents, calculates, and reads both
again (four document reads total). It compares Firestore `DocumentSnapshot.updateTime`
values at full timestamp precision. If either document changed or disappeared,
it fails rather than asserting that the sources were unchanged. The success flag
confirms unchanged versions across these reads; it cannot rule out writes after
the final read. Concurrent application updates can cause a legitimate failure.

For an independent check, run with an identity whose effective IAM permissions
allow reads only. In Firebase Console compare `metrics`, `processingStatus`,
`transcript`, `durationSeconds`, session target, and existing timestamps before
and after. There should be no new fields or modified values. The script contains
only `doc`/`getAll` database operations; the mocked tests expose no write methods.

During Milestone 1 implementation this environment had
no configured ADC file, credential environment variable, or Google Cloud CLI,
and no specific recording IDs were supplied. The developer subsequently reported a
successful read-only preview on a real recording (31 seconds, 43 words, 83.2 WPM,
one `um`). That prior preview does not verify the new automatic persistence flow.

## Next milestone

Define metrics-only recovery for interrupted/failed attempts before introducing
AI analysis execution and its own retry/idempotency behavior. AI feedback, ratings,
final feedback screen and transitions to `analysing`/`completed` remain unimplemented.
