# Account suspension security investigation

Date: 2026-10-31 (Africa/Johannesburg).

## Verdict

**Blocked; no production-code fix applied.** The existing direct Firebase Storage transport cannot satisfy the requested immediate suspension guarantee through a small rules/callable patch alone. In addition to the three-document authorization problem, previously issued Firebase download tokens authorize new downloads independently of Storage rules. This was reproduced locally, including against deny-all rules.

The task explicitly permits reporting an architectural blocker rather than implementing a partial or misleading fix. That fallback applies here. The staged ARMONY/HLAX merge, all runtime code, rules, processors, dependencies and public interfaces remain unchanged by this investigation. The new security tests intentionally fail where the required protections are absent; passing regression tests must not be interpreted as security acceptance.

## Root cause and authorization trace

1. `services/recordingService.js` prepares owned metadata under `users/{uid}/sessions/{sessionId}/recordings/{recordingId}`. Firestore rules check the profile suspension field and deletion state.
2. `services/audioUploadService.js` sends bytes directly using the Firebase Storage client SDK. Its prior Firestore check is not an authorization boundary: a caller can invoke Storage directly or reuse previously prepared metadata.
3. `storage.rules` uses the session document and recording document to enforce deletion, ownership, path, upload status, type and size. It never reads the current profile. A caller's still-valid cached identity remains sufficient even when the profile is disabled or missing. Both canonical and legacy paths are affected.
4. Storage reads currently check UID ownership only. Although the app's playback uses locally retained recordings, an authorized caller can request Storage metadata/download URLs directly. Hiding that API in the app does not remove it.
5. `deleteRecording` calls the recording deletion processor with an authenticated UID. Its transactions check session/recording ownership and deletion state, but not the profile or live Auth disabled state. `retryRecordingAnalysis` has the same omission before resetting an eligible analysis attempt.
6. `deleteSession` already checks live Auth and profile state, then marks the session deleting before removing both Storage prefixes. Its profile check is outside the deletion-marker transaction; a future design must define admission ordering relative to concurrent suspension.
7. `setUserDisabled` claims an actor-bound operation and user lock. Suspension sets the profile mirror first, disables Auth, revokes refresh tokens, verifies both systems and completes the operation/activity transaction. Reactivation enables Auth before clearing the profile mirror. Failures retain unresolved operations/locks. This protects Firestore's mirror-based access, but Storage and the two recording callables do not consult that barrier.
8. Storage finalization starts the existing Deepgram -> metrics -> Gemini workflow using the Admin SDK. Workers bypass client rules and retain generation/job/deletion guards. They do not inspect suspension. Already accepted work currently continues; no processor or status changes were made.

## Verified platform behavior

- Firebase documents a maximum of **two** Firestore accesses per Storage rules evaluation. Profile, session and recording are three distinct documents; caching does not combine them. [Official rules limits](https://firebase.google.com/docs/rules/rules-behavior)
- ID tokens are short lived but remain usable without an additional revocation/current-state check. Revoking refresh tokens is not a substitute for checking the authorization state of each protected request. [Official session management](https://firebase.google.com/docs/auth/admin/manage-sessions)
- Firebase documents download URLs as long-lived, revocable, shareable token URLs. Direct authenticated SDK downloads provide finer-grained rule control, but changing the app to use them alone does not remove a caller's ability to retain a previously issued URL. [Storage reference](https://firebase.google.com/docs/reference/swift/firebasestorage/api/reference/Classes/StorageReference), [download documentation](https://firebase.google.com/docs/storage/web/download-files)
- In the installed Firebase CLI 15.34.2 emulator, `storage/files.js:getObject` accepts a valid download token before invoking its rules validator. The Firebase API creates/returns download tokens during upload/metadata handling. Local tests confirm a new unauthenticated token-URL request returns HTTP 200 after all Storage reads/writes are denied; the same request without the token returns 403. This is a fresh network fetch, not cached audio.
- The installed emulator **does not enforce the documented two-document limit in the tested case**: it accepted the three-lookup candidate after a successful two-lookup control. That conformance failure is reported separately from application security failures. The candidate was loaded only into an isolated demo bucket, never written to `storage.rules`, and is not a viable production fix.

## Alternatives evaluated

| Approach | Assessment |
| --- | --- |
| Add a profile lookup to existing upload rules | Exceeds the documented limit. The emulator's acceptance is not production evidence. |
| Add disabled custom claims, force client logout or refresh tokens | Existing tokens/client bypass remain; does not revoke download capabilities. |
| Replace a session/recording lookup with the profile | Drops an existing deletion/status safeguard. Rejected. |
| Mirror suspension onto every session/recording | Introduces fan-out state, new-session synchronization, partial-update and reactivation recovery problems. Does not solve retained download tokens even with perfect mirroring. |
| Put a server-managed session-deletion map on the profile, then read profile + recording | Can reduce rule lookups with transactional deletion-map maintenance, but changes deletion authority, needs safe migration of existing deleting sessions, has document-size/contention limits, and still leaves token URLs outside the barrier. Not a complete fix. |
| Strip or rotate download tokens only when suspended or in a finalize trigger | Object-by-object revocation is not atomic with profile state. Failures and late uploads can leave or mint capabilities; trigger cleanup has an access window. Needs a lifecycle/cutover design, not a best-effort loop. |
| Return short-lived signed URLs instead | Limits the exposure window but does not enforce current suspension on each later request. Signed upload/resumable capabilities are similarly not a live account-status check. |
| Mediate protected byte access through authenticated backend handlers, with direct client object access closed | Recommended design direction. It centralizes current account, session and recording checks without the Storage rules lookup cap, and can avoid issuing reusable download capabilities. Requires an upload/download transport change and migration, so it is not implemented as a narrow patch here. |

## Recommended solution and required scope

Use a small authenticated media access boundary in the existing backend infrastructure where feasible. Keep the authoritative suspension state in the existing profile; do not fan it out to every recording.

Required invariants for that implementation:

1. Authenticate each upload/download/delete/retry request and check current Auth disabled state plus the profile barrier. Missing or unreadable state must deny access. Check profile state in the same Firestore transaction that admits recording deletion or analysis retry; an external Auth check alone cannot serialize a profile suspension race.
2. Retain existing ID/path ownership validation, session/recording deletion markers, processing-status restrictions, size/type checks, both Storage layouts and deletion retry semantics.
3. Deny direct client access to the protected objects after cutover. Store finalized objects without reusable Firebase download tokens; do not expose service credentials or signed read/write URLs as a substitute for per-request checks.
4. Before claiming strict suspension enforcement for existing recordings, revoke existing download tokens in both layouts and drain/cancel outstanding direct-upload capabilities during a controlled cutover. Keep access closed until that inventory/revocation step succeeds. Old app versions using the current direct-upload transport need an explicit compatibility/cutover policy.
5. Retain the existing suspension operation IDs, locks and activity completion. Use an explicit authorization barrier until all required state changes succeed; failed suspension/reactivation must not open access. Do not clear unresolved locks automatically.
6. Define a transaction-based admission point relative to suspension. Requests admitted before it may finish under a documented policy; requests admitted after it must fail. No mechanism can recall bytes already downloaded or copied locally. Do not describe previously issued but unused bearer URLs as already-running downloads.
7. For uploads, preserve accepted local audio and metadata on failure. Finalize only a fully validated owned object into the existing canonical/legacy path so the existing Storage trigger still drives Deepgram, metrics and Gemini. Do not create pipeline events for partial temporary bytes. Recheck authorization before accepting a not-yet-admitted upload; handle object-finalization/suspension races explicitly.
8. Preserve already-admitted background work unless the product requires cancellation. Letting trusted processing finish while denying client reads and new retries is the smallest policy that preserves the working processors. That policy must be tested, not inferred from passing existing tests.

This is a recommended architecture, **not a validated implementation**. It expands the byte-transfer contract and requires emulator coverage for admission/commit races, interrupted uploads, cleanup, replay and reactivation, plus native transport testing. A base64 callable upload is not a drop-in replacement: the app permits 32 MiB audio and encoding expands it beyond the documented 32 MB second-generation HTTP request cap. Binary transport and maximum-size/range behavior need validation before selecting the endpoint implementation. [Functions quotas](https://firebase.google.com/docs/functions/quotas)

## Changes made in this task

- Added `functions/test/suspensionSecurity.emulator.test.js`: local-only security acceptance probes and a separate emulator-limit conformance assertion. It refuses to run unless Firestore/Storage emulator endpoints exactly match localhost test ports, uses only `demo-*` projects, and mocks Auth/provider-facing operations. It does not modify repository rules.
- Added this report.
- Added a pointer from `docs/admin-merge-report.md` to this follow-up investigation.

No application/backend/rules fix was partially applied. The new audit suite is invoked explicitly, separately from the existing regression scripts, because it deliberately exposes unresolved acceptance failures and temporarily exercises candidate rules in isolated emulator buckets. No tests were skipped or weakened to make the audit green.

## Test results

| Suite/check | Passed | Failed | Skipped | Meaning |
| --- | ---: | ---: | ---: | --- |
| Existing normal-user suite | 158 | 0 | 0 | Current recording/processing/account behavior remains intact. |
| Admin backend, deletion, operation IDs/store and attempt-flow tests | 119 | 0 | 0 | 102 backend tests + 10 operation/store + 7 presentation tests. |
| Admin component/service and authentication tests | 23 | 0 | 0 | Jest, runInBand, 15-second per-test limit. |
| Existing Firestore/Storage and concurrency emulator suites | 28 | 0 | 0 | 17 recording/rules integration, 10 admin rules, 1 operation concurrency. |
| New suspension security acceptance checks | 4 | 11 | 0 | Required denials fail; not a secure result. |
| Emulator two-document-limit conformance | 0 | 1 | 0 | Three distinct lookups were accepted contrary to the documented limit. |
| New test syntax and tracked diff whitespace | PASS | ? | ? | No runtime edits. |
| Native device, live Auth, production rules/providers, future gateway races and migration | NOT RUN | ? | ? | No implementation exists to validate these future guarantees. |

The 328 existing regression tests passed in this task. The new audit executed 16 checks with 4 passes and 12 failures. Eleven are application security failures; one is emulator conformance. There were no skipped tests in these executed suites.

Security failures reproduced:

- Completed suspension reports suspended after the real Firestore operation/lock completion, but the cached-identity upload succeeds (Auth is mocked).
- Auth failure after setting the profile barrier leaves a pending operation and lock, but Storage upload still succeeds.
- Suspended upload and authenticated byte download succeed for each audio layout (4 failures).
- Missing-profile uploads succeed for each audio layout (2 failures).
- Suspended recording deletion succeeds, and an eligible AI retry succeeds (2 failures).
- A saved download URL issues a fresh unauthenticated HTTP request successfully after deny-all rules; authenticated/no-token control requests are denied (1 failure).

The four passing new controls verify active/reactivated upload/download and session/recording deletion upload restrictions for both audio layouts. They do not establish full reactivation race safety. The existing suites cover deletion/processing races and operation locking; in-flight upload admission, token revocation cutover and the proposed media boundary are not implemented or verified.


The initial audit run used a separate Firestore project for data, but emulator Storage cross-service reads used the CLI project. That invalid fixture caused unrelated permission failures. It was corrected to use `demo-speaksharp` for cross-service data; those initial results are not used as security evidence. The lookup test also verifies a successful original-rule upload before loading its candidate, so a missing fixture cannot falsely demonstrate the lookup limit.

The new tests use emulator-injected authentication claims reused across profile changes, not production-signed JWTs. The completed/interrupted suspension cases run the real operation/lock workflow against Firestore with a mocked Auth adapter. External speech/AI services are not called. No physical-device, production Firebase, deployed IAM/rules, or full live Auth validation is claimed.

## Reproduce

Use Java 21 on PATH and the repository's existing emulator configuration. Run the audit separately from other emulator suites to avoid shared emulator lifecycle conflicts:

```powershell
& .\node_modules\.bin\firebase.cmd emulators:exec --project demo-speaksharp --config firebase.test.json --only firestore,storage "node --test functions/test/suspensionSecurity.emulator.test.js"
```

Expected current outcome is a nonzero exit. Do not deploy the three-lookup candidate or interpret the passing controls as suspension acceptance.

Existing checks rerun in this task:

```powershell
npm.cmd test --prefix functions
# Explicit non-emulator functions/*.test.js plus the operation/store/attempt-flow tests.
npx.cmd --no-install jest --config jest.component.config.js --runInBand --testTimeout=15000 components/screens/AdminUserDetailsScreen.test.js services/adminService.test.js context/AuthContext.test.js
npm.cmd run test:rules
```

## Repository and delivery state

- Branch: ARMONY; HEAD remains `68ffc251e591b6a05ead0a3513ff68cfb14e9983`.
- Pending merge source: `c703c41fcfa796dcd98b2c7243dbc59eb840e2a1`.
- Existing staged merge is preserved. This task's audit/report additions are left unstaged for review.
- No abort, reset, merge restart, commit, push, deployment, production-resource access/mutation, IAM, secrets or real-user changes. `main` is untouched.
- Security acceptance is **not ready**. Limited local regression/manual investigation remains possible, but the suspension blocker must remain open before deployment or integration approval.
