# Final AI analysis stage

## Repository findings and integration

- Functions use Node 22 and CommonJS. `transcribeRecording` saves the transcript,
  then calculates and commits metrics in `transcriptionProcessor.js`. Both writes
  use `transcript_ready`; there is no separate metrics trigger.
- `analyseRecording` observes updates to
  `users/{userId}/sessions/{sessionId}/recordings/{recordingId}`. It reacts to saved
  metrics or an explicit analysis retry. The transcript-only update and unrelated
  timestamp updates do not invoke Gemini.
- The existing transcription function remains in `africa-south1` beside its Storage
  bucket. Both new functions use `us-central1`, matching the client's callable region.
- The current recording creation code does **not** persist `attemptNumber` or
  increment `attemptCount`. This milestone preserves that behavior. Attempt order
  follows the existing `createdAt` descending query used by the session screen.
- Firestore rules already restrict generated recording fields and session ratings
  to the backend. No rules, indexes, collections, or hierarchy changes are required.

## Analysis contract

`analysis.js` uses `@google/genai@2.31.0`, the stable `gemini-3.8-flash` model and the
existing Secret Manager `GEMINI_API_KEY`. Only `analyseRecording` binds this secret;
the retry callable has no key access. No client key, alternative provider, API project
switch, billing change, custom HTTP implementation or secret creation is involved.

One `models.generateContent` call uses `systemInstruction`, JSON MIME type and
`responseJsonSchema` derived from the strict Zod schema. It uses low thinking,
6,000 output tokens, a 120-second SDK timeout and one transport attempt (no SDK
retries). The function has a 300-second timeout, two maximum instances, concurrency
one and no automatic event retries.

Only the title, optional context and target duration, original transcript, duration,
and the five canonical metric fields are sent. Word timings, arbitrary metrics,
audio, identifiers and other metadata are excluded. The existing metric calculator,
including its exclusion of `actually` from fillers, is unchanged.

Conservative input limits reject fewer than 10 word tokens, fewer than 3 distinct
tokens, empty/nontext speech, malformed required metrics, transcript text over
40,000 characters, titles over 500 characters, or context over 8,000 characters.
Oversize content fails rather than silently truncating the evaluation. Valid zero
metrics and a null optional target-duration result remain valid. The rubric also
requires the model to withhold an assessment when content is unusable.

Zod 4.6.7 rejects missing/extra fields at every response object level, numeric
strings, null/nonfinite/out-of-range scores, blank strings and invalid list sizes.
Each feedback string is bounded at 1,200 characters. No partial result or invented
default is stored. Structure component scores remain diagnostic. Firebase computes
the five-criterion weighted rating, rounds it to one decimal and stores a number.

## Claims, persistence and retry

An atomic claim sets `processingStatus: "analysing"` and an `analysisJob` containing
a unique ID, attempt counter and server timestamp. Repeated or simultaneous events
cannot acquire the same attempt. Events from an earlier retry cannot acquire a newer
attempt. Previously valid feedback and completed recordings never regenerate.

After validation, one transaction saves the complete nested `aiFeedback` map,
including `overallRating`, sets `completed`, records `analysedAt`/`updatedAt`, and
updates the parent session's `ratingSum`, `bestRating`, and applicable `latestRating`.
The completion transaction is the once-only contribution marker. It preserves
`attemptCount` and updates `latestRating` only if this is the newest recording by
`createdAt`, so an older completion cannot overwrite the latest attempt's rating.
No new session fields are needed; normal session edits still satisfy existing rules.

Failures store only `{ stage: "analysis", code }` in `processingError`. Logs include
safe stage/code/recording identifiers, never provider response bodies, transcripts,
keys or raw exceptions. The audio, transcript, metrics and unrelated fields remain.
Claims and completion both respect session deletion and never recreate documents.

The existing processing screen listens through its existing `onSnapshot`. Its fourth
spinner is active for `analysing`, succeeds only after `completed` with saved feedback,
and displays a safe error on AI failure. The first three steps remain successful
when only analysis fails. Navigation and the Feedback screen are unchanged.

`retryRecordingAnalysis` authenticates the caller and resolves paths from that UID.
It resets only a failed AI stage to `transcript_ready` with a newer attempt counter,
which triggers analysis automatically. It does not upload, transcribe or calculate
metrics again. Quota failures enforce a one-minute minimum before a manual retry;
daily quota exhaustion may require waiting longer. No automatic retry loop runs.

If the function is terminated or Firestore is completely unavailable, a failure
write may itself be impossible. A user can recover an analysis that has been waiting
or active for more than six minutes using the same retry button. The server rejects
early retries, and a late worker cannot commit after its claim is superseded. There
is no timer-driven completion, polling, scheduled recovery or queue. A manual retry
can make one new Gemini request if an earlier response was lost; it cannot recover
an unpersisted response from a terminated process.

## Deployment (not performed)

From the nested app root, after reviewing the local changes:

```powershell
firebase.cmd deploy --only "functions:analyseRecording,functions:retryRecordingAnalysis" --project speaksharp-3893c
```

This assumes the existing working transcription/metrics stage and current rules are
already deployed. The existing `GEMINI_API_KEY` must be accessible to the deployed
analysis function through its explicit secret binding. Do not recreate it or put it
in a client `.env`. No automatic billing, infrastructure or IAM changes were performed.

Google lists this model as stable and its standard API requests as Free Tier eligible:
[model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.8-flash).
The installed methods/configuration were checked against the SDK and its
[generation configuration reference](https://googleapis.github.io/js-genai/release_docs/interfaces/types.GenerateContentConfig.html).
Availability/quota for the actual secret's project is unverified. A denied model or
exhausted quota fails visibly; the code never selects another model or service.

Old documents do not receive new Firestore events merely because a trigger is deployed.
For an existing metrics-ready attempt, the explicit retry button can start analysis
after the six-minute waiting threshold. New recordings start automatically.

## Verification performed locally

- `npm.cmd test` in `functions`: 104 passed, zero failures. Includes the existing
  transcription/metric tests and mocked schema, SDK transport, duplicate-event,
  quota/error, aggregate, input, retry, stale-claim and frontend progress tests.
- `npm.cmd run test:rules`: 11 passed, zero failures against the `demo-speaksharp`
  Firestore/Storage emulators with Java 21. A controlled pipeline simulation uses
  mocked Deepgram/Gemini with the real calculator and real Firestore transactions.
  It verifies concurrent duplicate events, saved maps, aggregate counting, older
  completion order and client-write protection. No live provider was contacted.
- `npx.cmd expo export --platform android --output-dir dist/analysis-check`:
  Android/Hermes export passed (1,557 modules). The initial sandbox attempt blocked
  the Hermes executable; the permitted rerun passed.
- `git diff --check` passed. No lint script exists in either package.
- `npm.cmd audit`: four existing transitive advisories (one high, three moderate):
  `body-parser`, `qs`, `gaxios`, and `uuid`. Their versions match the original lockfile;
  no unrelated dependency upgrades were made.

Production deployment, the real API key's model access, a live Gemini response,
production Firestore persistence, and Expo Go device verification remain outstanding.
The existing missing attempt-count increment also remains: this milestone preserves
the field as requested, so existing attempt-count/average-rating displays may still
need a separate correction.

## Expo Go and Firestore checklist after deployment

1. Create a session with a meaningful title/context. Record a clear 30-60 second
   speech with an introduction, developed ideas and conclusion; continue to processing.
2. Confirm upload, transcription and metrics complete. Without another action,
   observe `analysing` and the real fourth spinner, then `completed` and four checks.
   Leaving and reopening the attempt should show persisted progress.
3. Inspect the canonical recording document. Confirm transcript and metrics remain
   intact, `aiFeedback` is a map, every criterion/component has a numeric 0-10 score
   and nonempty feedback, strengths/improvements each have three entries, questions
   have three to five entries, and summary is nonempty.
4. Recalculate `0.25*clarity + 0.25*logicalStructure + 0.20*contentRelevance +
   0.15*conciseness + 0.15*audienceOrientation`, rounded to one decimal. Compare it
   with numeric `aiFeedback.overallRating`. Confirm session sum/best/latest updates,
   unchanged `attemptCount`, and a single completion contribution.
5. Reopen a completed attempt: no new Gemini invocation or rating contribution.
   Use mocked local tests for quota, invalid JSON, missing speech and duplicate events
   rather than spending API requests. If a real AI failure occurs, verify only the
   fourth stage fails and its retry preserves transcript/metrics and upload timestamps.
6. Keep the Feedback screen data population for its separate milestone.

## Changed files

- Added: `functions/aiFeedback.js`, `functions/analysisProcessor.js`, `functions/analysis.js`.
- Updated: `functions/index.js`, `functions/package.json`, `functions/package-lock.json`.
- Added: `utils/analysisProgress.js`; updated `utils/metricsProgress.js`,
  `services/processingService.js`, `components/screens/AttemptFlowScreen.js`.
- Added: `functions/test/analysis.test.js`, `functions/test/analysisProgress.test.mjs`;
  updated `functions/test/rules.test.js`.
- Added: `docs/ai-analysis.md`.
