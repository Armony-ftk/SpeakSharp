# Objective speaking metrics: development preview

This milestone calculates metrics in memory only. It adds no Cloud Function export,
trigger, deployment, Firestore writes, processing status, or UI integration.

## Existing contract

The backend is Node 22/CommonJS under `functions/`, with Firebase Admin and Node's
built-in test runner. Recording creation uses
`users/{userId}/sessions/{sessionId}/recordings/{recordingId}` with `durationSeconds`
and `processingStatus`. Transcription stores `transcript.originalText`. Sessions
store optional `targetDurationSeconds`. The current creation/transcription code
does not initialize `metrics`; any existing map is left untouched. The requested
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
  `actually`, and adjacent `you know` tokens. Punctuation/line breaks between `you`
  and `know` are ignored. Each phrase counts once. Only detected fillers appear in
  the breakdown, and its sum is the total.
- A finite positive numeric target uses inclusive 90%-110% boundaries for `close`;
  below is `under`, above is `over`. Missing/invalid target or unknown actual
  duration gives `null`. A known zero actual duration is `under` a valid target.
- Missing/nonstring transcript throws a clear error, rather than treating missing
  transcription as silence. An explicitly empty string is supported.

This is basic English token matching: meaningful uses of "like" and "actually"
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

Implementation verification: `npm.cmd test` passed all 66 tests (23 new metrics/
preview tests and 43 existing transcription tests). The sample above was printed
in the terminal: duration 40, word count 9, WPM 13.5, filler count 4, breakdown
`{ um: 1, actually: 1, like: 1, "you know": 1 }`, target status `close`.
The CLI missing-argument check exited with code 1 as expected; `git diff --check`
passed. No emulator, live Firestore, device, or deployment checks were performed.

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

Live verification was not performed during implementation: this environment had
no configured ADC file, credential environment variable, or Google Cloud CLI,
and no specific recording IDs were supplied. Local mocked tests are not evidence
of production access or production document state.

## Next milestone

Separately define when analysis runs and its retry/idempotency behavior, then
integrate server-side metrics persistence and Firestore-driven spinner completion.
This module is independent of that work. AI feedback and ratings remain separate.
