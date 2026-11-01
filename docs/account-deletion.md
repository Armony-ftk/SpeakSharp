**Account deletion implementation report — 1-2 November 2026**

Implemented locally for the existing Expo SDK 58 / Node.js 22 application. Production deployment and physical iPhone acceptance remain outstanding. No production account was accessed or deleted. No dependencies, processing statuses, audio paths, AI rubric, models or algorithms were changed.

**A. Behavior and authorization**

Open Profile, select Settings, then Delete Account. The existing confirmation dialog now supports a current-password field. Cancel clears the field and performs no deletion. The destructive action shows “Deleting your account...”, prevents duplicate submissions and disables conflicting account actions. The password exists only in component/service memory; only Firebase Authentication's existing credential API receives it.

Submitting Delete immediately pauses new upload scheduling and transfer preparation. A failed password/network check before the durable intent safely resumes the normal queue. The service uses `EmailAuthProvider.credential`, `reauthenticateWithCredential`, then `user.getIdToken(true)`. The `deleteAccount` v2 callable uses the existing Firebase app, Admin SDK and `us-central1` region. Every destructive request requires `request.auth.uid`, a verified `auth_time` within five minutes, and a current regular, enabled Auth account. Token and current Auth administrator claims are both rejected. Client-supplied UID, email and paths never select a deletion target. A missing Firestore profile does not prevent recovery of a previously started deletion.

A 256-bit random receipt is persisted locally before the callable starts. The server keeps only its SHA-256 hash. The same callable accepts a separate **read-only** `{ confirmOnly: true, receipt }` request after Auth deletion: this can return only `{ success: boolean }`; it neither accepts a target UID nor performs any mutations. It requires the matching unguessable receipt, a server checkpoint proving data cleanup, and a live Admin Auth check returning `auth/user-not-found`. This limited completion capability works without a surviving login. It cannot initiate or resume deletion. Unknown receipts return false. A timeout alone never proves success.

**B. Changed files**

| File | Purpose |
| --- | --- |
| `functions/accountDeletion.js` | Authenticated account cascade, bounded audio sweeps, recovery lease, verification and completion receipt. |
| `functions/deleteAccount.js` | One new v2 callable binding; existing region/runtime and Admin infrastructure. |
| `functions/accountDeletionGuard.js` | Shared transactional checkpoint check. |
| `functions/index.js` | Export `deleteAccount`; preserve existing exports. |
| `functions/transcriptionProcessor.js` | Guard transcription claims, transcript/metrics/failure commits and late uploads. |
| `functions/analysisProcessor.js` | Guard AI claims, completion, failure, aggregate updates and explicit retry. |
| `functions/recordingDeletion.js` | Coordinate existing recording deletion with account deletion. |
| `functions/deletion.js` | Existing session deletion rejects an account already being deleted. |
| `functions/adminActivity.js` | Create session activity once; redelivery cannot overwrite stored history after profile deletion. |
| `firestore.rules` | Deny ordinary writes and old-token profile recreation once a checkpoint exists. |
| `storage/accountDeletionState.js` | Durable per-account local deletion/confirmation state and subscriptions. |
| `storage/audioStorage.js` | Persist ownership beside URI mappings; adopt proven legacy mappings; remove only the confirmed owner's files/mappings. |
| `storage/recordingQueue.js` | Settle local saves and remove account-specific queue/journals/cache sources after confirmation. |
| `services/recordingSyncService.js` | Pause scheduling/retry by account and restore deletion state before the queue. |
| `services/audioUploadService.js` | Recheck deletion guard before transfer, including after native file preparation. |
| `services/accountDeletionService.js` | Password reauthentication, forced token refresh, upload settling, callable, confirmation and local cleanup. |
| `components/AccountDeletionGate.js` | Recovery UI above routes/Auth changes; unmount active account screens; resume/check/retry cleanup. |
| `components/screens/SettingsScreen.js` | Small Delete Account confirmation/password/loading/error UI. |
| `components/ui/ConfirmDialog.js` | Optional children slot reuses existing modal styling for the password field. |
| `app/_layout.js` | Mount deletion recovery inside AuthProvider, above existing navigation. |
| `components/screens/AdminActivityScreen.js` | Preserve stored historical names; show “Deleted user” when unavailable. |
| `functions/accountDeletion.test.js` | Eleven mocked backend authorization, cascade, pagination, failure, concurrency and receipt tests. |
| `functions/test/accountDeletion.emulator.test.js` | Real local Auth/Firestore/Storage cleanup, reauthentication, rule denial, admin preservation and processing races. |
| `functions/test/transcription.test.js` | Account checkpoint regression for claims and in-flight transcript/metrics writes. |
| `functions/test/analysis.test.js` | Account checkpoint regression for AI completion/failure and retry. |
| `functions/test/accountData.test.js` | Update dependency fixture/root-wrapper assertion while preserving shared-state tests. |
| `functions/adminActivity.test.js` | Update create-once trigger mocks and duplicate-delivery assertion. |
| `tests/offlineRecordings.test.cjs` | Device-state/service/queue/audio/transfer/save/restart regressions with native/Firebase mocks. |
| `components/screens/SettingsScreen.test.js` | Actual modal, cancellation, secure password, duplicate-tap and error rendering tests. |
| `components/AccountDeletionGate.test.js` | Account-screen unmount, recovery across Auth removal and other-account isolation. |
| `components/screens/AdminDashboardScreen.test.js` | Existing Activity test expects the requested missing-user fallback. |
| `package.json` | Add focused account-deletion test commands; dependencies unchanged. |
| `functions/package.json` | Include backend account deletion tests in the normal regression suite. |
| `docs/account-deletion.md` | This implementation/deployment/acceptance report. |

**C. Verified cleanup paths and ordering**

1. A transaction creates `accountDeletions/{authenticatedUid}` and marks an existing `users/{uid}` profile `deleting: true`. The checkpoint survives deletion and blocks old-token recreation. It stores only phase, receipt hashes and a short lease. Clients have no direct read/write rule for it.
2. Existing session documents under `users/{uid}/sessions` are paginated in batches of 200 and marked `deleting: true`. Firestore rules already prevent new sessions after the account guard is committed. Storage uses its existing session-plus-recording checks: no extra Storage rule lookup is added.
3. Storage objects under the exact delimited prefixes `recordings/{uid}/` and `users/{uid}/` are paginated 200 at a time and deleted with at most ten concurrent operations. This includes canonical `recordings/{uid}/{sessionId}/{recordingId}.m4a`, legacy `users/{uid}/sessions/{sessionId}/recordings/{recordingId}.m4a` and orphan audio without documents. Referenced valid audio paths fall under those same prefixes; arbitrary saved paths cannot extend deletion scope. Other UIDs and neighboring prefixes remain intact. Missing objects are safe; actual service errors abort the operation.
4. Admin SDK `recursiveDelete(users/{uid})` removes the profile and all nested sessions, recordings and any additional subcollections, including descendants of a missing parent. It never touches global administrative collections. Verification checks the root and remaining subcollections, sweeps Storage again and verifies both prefixes are empty.
5. Only then is the checkpoint advanced to `data_deleted`. Firebase Auth `deleteUser(uid)` is the final destructive server operation. A subsequent Auth lookup must confirm `auth/user-not-found` before returning success. Lease bookkeeping may run afterward; it cannot recreate user data.

Storage, Firestore or Auth errors never become success. The checkpoint/guards remain on failure. An ordinary error releases the lease; a crashed invocation's ten-minute lease expires after the callable's nine-minute hard timeout. Repeated cleanup is safe. In-flight processors read the checkpoint in the same transaction as their writes; a conflicting deletion forces a retry and suppresses the write. Existing update-only and generation/job guards remain intact. An upload already authorized before deletion can finalize later: the existing retryable Storage finalizer removes that exact generation without calling providers or recreating documents.

**D. Admin history**

History lives independently in `adminActivityLogs/{eventId}` and already stores historical UID/name/type/time/status. The reader does not need a live profile. Account deletion does not delete or rewrite those documents, `adminAccountStatusOperations`, or `adminAccountStatusLocks`. The session-created trigger now uses create-only writes, preserving the original document and timestamp on redelivery. Activity filtering, pagination, loading and authorization remain unchanged. The existing Users provider joins Auth and root profiles, so the deleted user disappears without a second directory implementation. Missing user details retain the existing not-found behavior.

**E. Offline queue and recovery**

The local marker uses `@speaksharp/account-deletions/v1`, keyed by UID, with `prepared`, `submitted` and `confirmed` phases. It contains no password or Firebase token. It is restored before account screens or synchronization mount. The account gate unmounts the existing recording/player hooks and shared account-data provider; their established cleanup releases native resources and listeners. The worker's owner checks reject further scheduling, retries and creates. The uploader checks again around asynchronous preparation; an already-started transfer is allowed to settle before server cleanup, with a bounded wait that fails safely without starting cloud deletion.

Existing per-entry persistence operations settle before cleanup. A dispatched save interrupted by the guard retains a source journal and never starts copying/uploading. Confirmed cleanup removes only the owner's `@speaksharp/recording-queue/v1/{encodedUid}/{recordingId}` records, saving journals, associated cache sources, owned persistent files under `Paths.document/SpeakSharp/recordings/{recordingId}.m4a`, and URI-map ownership entries in `@speaksharp/local-recordings/v1`. Synchronized files remain attributable after queue acknowledgement because ownership is retained with the mapping. Legacy mappings are adopted only when the current user's server-side recording hierarchy proves ownership before cloud deletion.

An unconfirmed/failed request retains local audio and the guard. Resume first checks the completion receipt, then reauthenticates if more destructive work is needed. A confirmed local-cleanup failure retains a confirmed marker so restart retries device cleanup without another deletion request. Sign-out is scoped to the same current UID, then the marker is removed and existing Auth routing returns to Sign In. Other accounts' queue/audio and global theme/admin preferences remain intact.

**F. Verification**

| Executed check | Result |
| --- | --- |
| `npm.cmd test` in `functions` | 172/172 passed, including 11 account-deletion backend tests and existing pipeline, deletion, progress and shared-account regressions. |
| Root `functions/*.test.js`, excluding `*.emulator.test.js`, via `node --test` | 120/120 passed in the broad admin/session run; ten cases overlap the Functions suite. The subsequently added object-deletion failure case also passed in the 11/11 focused backend run and final Functions suite. |
| `npm.cmd run test:offline` | 47/47 passed, including queue persistence, restart, synchronization, stage presentation and new account-deletion/service/native preparation mocks. |
| Scoped Jest component/auth/service run below | 59/59 tests passed across eight suites. |
| Combined Auth/Firestore/Storage emulator command below | 52/52 passed, including seven account-deletion integration cases, existing 28 rules/deletion/operation tests, admin demo and dashboard statistics. |
| `npx.cmd expo export --platform ios --output-dir dist/account-deletion-ios` | iOS Hermes export passed after allowing the local compiler outside its denying sandbox. |
| `git diff --check` | Passed. |

The broad Node backend command used PowerShell to select the root test files:

```powershell
$tests = Get-ChildItem functions -Filter '*.test.js' | Where-Object { $_.Name -notlike '*.emulator.test.js' } | ForEach-Object { $_.FullName }
node --test @tests
```

The component run was:

```powershell
npx.cmd jest --config jest.component.config.js --runInBand components/AccountDeletionGate.test.js components/screens/SettingsScreen.test.js components/screens/AdminDashboardScreen.test.js components/screens/AdminUsersScreen.test.js components/screens/AdminUserDetailsScreen.test.js components/screens/AdminSettingsScreen.test.js context/AuthContext.test.js services/adminService.test.js
```

With the existing Java 21 runtime and cached emulator binaries configured locally, the combined emulator run was:

```powershell
npx.cmd firebase emulators:exec --project demo-speaksharp --config firebase.test.json --only auth,firestore,storage "node --test tests/firestore.rules.test.js functions/test/rules.test.js functions/adminAccountStatusOperations.emulator.test.js functions/test/accountDeletion.emulator.test.js functions/test/adminDemo.emulator.test.js functions/test/adminStats.emulator.test.js"
```

The new reusable focused commands are `npm.cmd run test:account-deletion` and `npm.cmd run test:account-deletion:emulator`; the latter requires Java 21 on PATH. Evidence logs and the iOS artifact are retained in ignored `dist/account-deletion-*` paths. Test totals overlap and must not be added as unique test cases.

All destructive automated tests refuse to run unless emulator environment variables point to the specified localhost ports and use only `demo-` projects. Native APIs and providers are mocked where indicated. No real provider, production IAM, deployed callable transport or physical-device behavior is inferred from these checks.

Initial fixture failures caused by new imports/root wrappers and the new “Deleted user” label were corrected. Initial new emulator-test errors used the wrong directory response property and assumed a particular scheduling order; the tests now use the actual contract and a deterministic in-flight gate. The existing `tests/adminDemo.test.js` Jest suite still cannot initialize because its admin-layout import lacks an AsyncStorage native mock. That known fixture issue is separate from the passing emulator admin demo. The iOS compiler initially hit the known sandbox permission denial; a permitted rerun succeeded.

**G. Required deployment — owner executes**

Run from the nested `SpeakSharp` app directory. Deploy all changed guards before enabling the new UI on a physical device. Use the existing project and credentials:

```powershell
firebase.cmd deploy --project speaksharp-3893c --only "firestore:rules"
firebase.cmd deploy --project speaksharp-3893c --only "functions:deleteAccount,functions:deleteSession,functions:deleteRecording,functions:transcribeRecording,functions:analyseRecording,functions:retryRecordingAnalysis,functions:recordSessionCreated"
```

`deleteAccount` is the only new function. The other six functions need redeployment because they package changed guard/history code. `transcribeRecording` retains its existing `africa-south1` trigger region; callable and analysis regions remain unchanged. No other admin callable requires deployment. No Storage rules, indexes, secrets, runtime versions, configuration or dependencies were changed. Do not use an unrestricted `--only functions` deployment for this feature.

No IAM change was applied. The runtime must have existing Firestore recursive-delete and Storage list/delete access plus Firebase Auth get/delete permissions. Live permissions were not inspected or expanded. The callable uses the existing public transport/Firebase-verified handler pattern; recent authentication and regular-user authorization remain server enforced. If targeted deployment reports a missing runtime permission or invoker binding, inspect that specific service/account and grant only an approved required permission; do not expand project privileges automatically.

**H. Disposable physical iPhone acceptance**

1. Deploy the rules and seven targeted functions above. Start the existing SDK 58 app with `npx.cmd expo start --offline` from the nested app folder and open it in the existing compatible Expo Go/build. This CLI flag does not simulate an offline phone. Keep development Metro reachable for restart tests.
2. Create and verify a disposable regular Email/Password account. Record its UID privately from Firebase Console. Create at least two sessions, save several recordings and wait for actual transcript, metrics and AI feedback. Confirm both canonical Firestore hierarchy and uploaded `.m4a` objects. Keep a separate unrelated test account/recording for comparison.
3. In a separate admin session, suspend then reactivate only the disposable account if a trusted Admin activity entry is needed. Confirm session-created and Admin events exist in Activity and `adminActivityLogs`; record document IDs and existing fields/timestamps. Never use a real user's account or suspend an administrator.
4. Put the iPhone offline, save an additional recording, and verify it is queued locally. Open Profile → Settings → Delete Account. Cancel once and verify nothing changes. Test a wrong password while online and verify a friendly error and retained recordings. Deletion while offline must require a connection.
5. For the main queued-recording case, open the confirmation while offline, enter the password, then restore internet and promptly confirm while the queued item is still pending. Observe the deletion message; double-tap the action. If synchronization already completed before confirmation, create a fresh queued attempt and repeat. The queue can legitimately resume before deletion is confirmed. No new transfer should begin once the local deletion guard is established; any already-started transfer settles before destructive cleanup.
6. Confirm the app returns to Sign In after local cleanup. Fully restart it and verify the deleted account's queued entries/audio do not reappear. Attempt to sign in using the deleted account's credentials; authentication must fail. Sign into the unrelated disposable account and verify its own sessions, files, queue, playback and normal recording flow still work.
7. In Firebase Console, verify the disposable UID is absent from Authentication, `users/{uid}` and its descendants are gone, and both Storage prefixes are empty. Check again after outstanding processing/finalization events settle. The minimal `accountDeletions/{uid}` tombstone should remain; do not delete it because it blocks old-token recreation and supports confirmation. Inspect only sanitized function outcomes; no plaintext password should appear in application logs.
8. In the admin app, refresh Users and confirm the deleted UID is absent. Open Activity and verify the original history documents, timestamps and stored names remain unchanged; missing names display “Deleted user”. Exercise Activity pagination/filters and the dashboard. Existing history need not change its stored name just because the account disappeared.
9. On another disposable run, disconnect during the callable, restart and use Check deletion / retry cleanup. Local recordings must remain until a confirmed response/receipt; Resume deletion requires the password if the account still exists. Exercise deletion while an upload/analysis is already active and confirm no new Firestore documents/session aggregates appear afterward. Check no provider call starts for a late, deleted-account upload. Repeat with local cleanup interrupted by app termination and with another account's queued audio present.

For a fully networkless cold start, use an installed build with an embedded bundle; Expo Go may need Metro to bootstrap. Native file deletion, playback release, OS lifecycle, deployed service permissions, retained-media behavior and real provider timing remain physical-device/live acceptance work.

**I. Remaining boundaries**

- Historical local URI mappings from older versions have no UID. Still-existing remote recordings prove ownership and are migrated before deletion; new queue saves always record it. A legacy file whose recording was already removed remotely, with no queue journal or ownership metadata, cannot safely be attributed to an account. Such unidentifiable files are retained rather than deleting another account's audio. This is a pre-existing information gap; this implementation cannot honestly promise removal of those unattributable legacy orphans.
- Only the current installation's local files can be removed. Another offline device cannot be remotely wiped by a callable. Server tombstones/rules prevent it from recreating cloud data; device-specific cleanup on another installation without the initiating receipt is outside the tested flow.
- Already-authorized late uploads are handled by the existing retryable finalizer. Local tests verify generation cleanup and no resurrection; actual Eventarc delivery latency/provider races require deployed acceptance. There is no cross-service atomic transaction guaranteeing that no preauthorized object can appear briefly before its finalization event runs.
- The separately documented Storage/media suspension-security limitation in `docs/account-suspension-security.md` remains unresolved. Account deletion reuses session guards and removes objects; it does not redesign suspension or retained download-token access.
- No production success, device validation or live IAM acceptance is claimed. No commit, push, merge or deployment was performed.
