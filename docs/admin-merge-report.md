# ARMONY / HLAX integration report

Date: 2026-10-31 (Africa/Johannesburg).

Follow-up: [Account suspension security investigation](account-suspension-security.md) reproduces the recording-access gaps, identifies retained download-token access and an emulator lookup-limit discrepancy, and documents the required design. The security blocker remains open; no partial runtime fix was applied.

## Status

Local merge conflicts are resolved and staged; the merge remains uncommitted. The user subsequently narrowed the task to academic demo happy paths and explicitly deferred the security redesign. See [current demo verification](admin-demo-verification.md) for the native operation-ID fix, fresh-login emulator checks and current commit recommendation. That follow-up is unstaged; this report's original integration results remain below. No infrastructure, production data, IAM, claims, or secrets were changed.

## Git safety and recovery

- Repository: Armony-ftk/SpeakSharp; origin uses HTTPS.
- Starting/destination branch: ARMONY.
- Recovery commit / current HEAD: 68ffc251e591b6a05ead0a3513ff68cfb14e9983.
- Source: origin/HLAX at c703c41fcfa796dcd98b2c7243dbc59eb840e2a1.
- Initial tree was clean. After fetch, ARMONY and origin/ARMONY matched (0 ahead / 0 behind). A final live git ls-remote check confirmed origin/ARMONY still at 68ffc251e591b6a05ead0a3513ff68cfb14e9983 and main still at b4849fc3468702080da52b8638a151c92f73326b.
- ARMONY and HLAX diverged by 13 / 7 unique commits.
- main and origin/main were b4849fc3468702080da52b8638a151c92f73326b and were not changed.
- Merge command: git merge --no-ff --no-commit origin/HLAX.
- ORIG_HEAD retains the recovery commit; MERGE_HEAD identifies the fetched source. No backup branch was created.
- GitHub CLI is unavailable. No PR was created/reused, no GitHub conflict status was obtained, and no GitHub merge action was used. Existing PR status is unknown.

## Conflict resolution

Eight paths conflicted:

| File | Resolution |
| --- | --- |
| functions/index.js | Kept ARMONY initialization and all five existing exports; added all six admin exports once. |
| functions/deletion.js | Combined current Auth/profile suspension checks with the deleting marker, canonical and legacy audio cleanup, and recursive Firestore deletion. Kept dependency injection for tests and deferred getFirestore until handler use. |
| firestore.rules | Combined active-profile checks with existing deletion, recording-schema, timestamp, rating and aggregate protections. Extended active-profile gating to nested recording reads/writes. Retained server-only disabled field and admin collections. Removed a redundant nested activity deny block. |
| firebase.json | Retained Functions, Firestore and Storage configuration and added incoming Firestore emulator settings. Tests explicitly use firebase.test.json and demo project IDs. |
| package.json | Retained ARMONY SDK 58/runtime packages, including Audio, File System and Asset; added incoming test tooling and scripts. Pinned react-test-renderer to React 19.3.0 after a peer-resolution failure. |
| package-lock.json | Reconciled the combined manifest from ARMONY's runtime lock baseline using npm, without force or legacy peer flags. |
| functions/package.json | Preserved all ARMONY dependencies and scripts, including Deepgram, Google GenAI and Zod; no parent-app dependency. |
| functions/package-lock.json | Retained ARMONY's complete backend dependency lock. |

## Preserved behavior and integrated admin work

Existing exports retained: deleteSession, deleteRecording, transcribeRecording, analyseRecording, retryRecordingAnalysis.

Admin exports added: getAdminStats, getUsers, getUserDetails, getActivityLogs, setUserDisabled, recordSessionCreated.

Runtime export inspection confirmed one initialized Admin SDK app, all 11 endpoint exports, the africa-south1 Storage-finalization transcription trigger with DEEPGRAM_API_KEY, and the us-central1 recording-update analysis trigger with GEMINI_API_KEY. No secret values were accessed. Trigger options and pipeline source match pre-merge ARMONY.

Normal-user recording/transcription/metrics/analysis processors, feedback schema and prompt, recording deletion processor, Firebase client configuration, AccountDataContext and useProgress are unchanged. The root still mounts one AccountDataProvider inside AuthProvider, keyed by authenticated UID/access. Verified-user guards remain explicit. Admin identification extends the existing auth context with custom-claim checks rather than adding an auth provider. Admin layout requires both the resolved admin role and access check. Backend requireAdmin checks the token claim and current Auth record, verified email, disabled state and current claim before protected reads.

The canonical users/{uid}/sessions/{sessionId}/recordings/{recordingId} structure and both trusted audio layouts are preserved. Session creation/update remain client Firestore operations; they were not missing backend exports. Incoming Home/Sessions footer styling and tab anchor are retained.

Integrated admin screens cover dashboard, directory/search/filter/pagination, user details, activity, confirmation dialogs, suspension/reactivation and existing logout/settings navigation. Operation IDs, actor binding, transaction locks, final-state verification, durable unresolved attempts and deterministic activity completion remain intact. No automatic stale-lock recovery was introduced.

## Confirmed blockers and limitations

1. Storage suspension enforcement: storage.rules checks ownership, session deletion and recording deletion/status, but not users/{uid}.disabled. Existing tokens can still authorize reads/uploads for eligible existing recordings after the profile is suspended. The rule already reads two Firestore documents; adding the profile would exceed the documented two-access Storage rule limit. Removing a deletion check would weaken existing behavior. A broader design decision is required; no Storage rule redesign was attempted. Reference: https://firebase.google.com/docs/rules/rules-behavior (Cloud Storage security rule limits). Options for a separately scoped design include trusted suspension state propagated to a document already consulted by Storage, or redesigning upload authorization; either requires careful race/failure handling and additional tests.
2. deleteRecording and retryRecordingAnalysis authenticate ownership but do not check current Auth/profile suspension. They remain unchanged to preserve the pipeline pending the suspension policy decision. Background processing already accepted before suspension also needs an explicit policy.
3. Incoming admin implementation is incomplete in documented areas: getAdminStats only fills totalSessions; getUserDetails returns null for recording totals and recent activity; recording/analysis lifecycle activity producers are absent. No fabricated totals or new features were added.
4. Activity filtering and ordering may require composite Firestore indexes. No index configuration is shipped in the branch; deployed index availability was not inspected.
5. Unresolved account-status operations intentionally retain locks and require trusted recovery. Auth and Firestore mutations are not globally atomic. Persisted retry IDs are keyed by target user, not actor; another administrator on the same device can encounter a safely rejected actor-bound operation requiring recovery.
6. Follow-up fixed native operation ID generation using SDK-compatible expo-crypto. Component tests and iOS/Hermes export pass; physical iPhone suspension/reactivation remains unverified.
7. Existing demo route/unused mock-access constant do not bypass the final admin guard; actual admin services use callables. The incoming project alias targets speaksharp-3893c; every emulator command overrides it with demo projects.

## Validation

| Suite/check | Final result | Evidence / limitations |
| --- | --- | --- |
| Existing normal-user Functions/UI logic suite | PASS, 158/158 | npm.cmd test --prefix functions |
| Admin backend, authorization, users, activity, suspension, locking and session deletion | PASS, 102/102 | node --test over functions/*.test.js excluding *.emulator.test.js |
| Operation IDs and durable retry store | PASS, 10/10 | node --test services/operationId.test.js services/accountStatusOperationStore.test.js |
| Existing attempt-flow presentation regressions | PASS, 7/7 | node --test tests/attemptFlowPresentation.test.cjs |
| Admin details component and service adapters | PASS, 19/19 | Jest with jest.component.config.js, --runInBand --testTimeout=15000 |
| New authentication-context regressions | PASS, 4/4 | Same Jest run, context/AuthContext.test.js |
| Firestore/Storage integration and recording rules | PASS, 17/17 | Local emulators; provider responses and Auth lookup mocked |
| Admin Firestore rules | PASS, 10/10 | Local emulator; disabled field, ownership, admin collections |
| Account-operation transaction concurrency | PASS, 1/1 | Local Firestore emulator |
| Root and Functions npm dependency trees | PASS | npm.cmd ls --depth=0 and npm.cmd ls --prefix functions --depth=0; Node v22.16.0/npm 10.9.2 |
| Backend JavaScript syntax | PASS, 26 files | node --check for top-level functions/*.js |
| Runtime exports, secret bindings and preservation diff | PASS | 11 endpoint exports; pipeline and shared-state source unchanged |
| iOS/Hermes Expo export | PASS | npx.cmd --no-install expo export --platform ios --output-dir dist/admin-merge-ios; no device run |
| Expo dependency compatibility | FAIL, existing patch drift | expo 58.0.21 -> recommended ~58.0.22; expo-audio 58.0.10 -> ~58.0.11; expo-router 58.0.28 -> ~58.0.29. All three installed versions match pre-merge ARMONY. Runtime versions were not upgraded. |
| Whitespace/conflict/credential review | PASS | git diff --check; no remaining conflict markers or unmerged paths; no matched private-key/Firebase-key patterns in changed source. This is not a comprehensive secret audit. |
| GitHub PR inspection | UNAVAILABLE | gh is not installed; PR URL/state unknown |
| Android/web export, physical iPhone, live Firebase/providers and full Auth+Firestore account-operation E2E | NOT RUN | No production/device validation; no deployments |

Total executed automated tests in the final passing runs: 328. This does not cover the unresolved Storage/callable suspension gap.

Initial failures and resolution:

- Fetch and Expo metadata access were blocked by sandbox network restrictions and succeeded with allowed network access.
- npm initially rejected react-test-renderer 19.3.1 against React 19.3.0; pinning the renderer to 19.3.0 resolved installation. No force/legacy-peer-deps flags were used. The initial restricted-network install attempt was interrupted before retrying with network access.
- The new session deletion tests initially encountered eager getFirestore initialization after consolidation into functions/index.js. Deferring the injected getDb default until handler use removed the test import failure and retained single initialization.
- Jest initially could not resolve Expo's nested expo-modules-core package/subpaths. A test-only module mapping to Expo's installed dependency resolved it without changing runtime dependencies.
- The first fully running Jest pass had 22 passing tests and one 5-second timeout during the first component test. A rerun with a 15-second per-test limit passed all 23. No production logic was changed to address the timeout; the original timeout is retained as environment/timing evidence.
- iOS export initially failed only at hermesc.exe execution with permission denied. The permitted rerun produced the Hermes bundle successfully.
- Emulator denials printed in logs are expected negative security assertions; all 28 emulator tests passed.

Reproduce emulator tests with Java 21 on PATH, the existing cached emulator JARs and an isolated Firebase CLI config directory, then run npm.cmd run test:rules. The script explicitly selects demo-speaksharp, firebase.test.json, and only Firestore/Storage emulators. Generated CLI logs were moved outside the repository; export output is under ignored dist/.

Tests use mocked Auth/providers unless explicitly identified as emulator tests. The session cascade emulator test injects mocked Auth with real emulator Firestore/Storage; it never calls remote Auth. Admin rules and concurrency tests were moved from hardcoded port 8080 to the existing isolated 8085 test configuration with demo project IDs. The recording rules fixture now creates the required profile. A focused rules test covers suspended canonical/legacy recording metadata and reactivation. Deletion tests cover both audio layouts, marker ordering and failure retention. Auth-context regression tests cover claims, verification, stale async responses, account changes, logout and observer cleanup.

## Recommendation

The original full-security integration acceptance remains blocked. Under the user's later academic-demo scope, the source is ready for a demo-scoped ARMONY commit after review, with the security exceptions explicitly retained. No commit or push has been performed. See [current demo verification](admin-demo-verification.md); this does not approve production security or eventual integration into main.

## Manual validation and deployment prerequisites

The following is the broader acceptance checklist. For the narrower academic demonstration, use the existing admin and a separate normal test account only after live testing is authorized, following the current demo verification report:

1. Verified ordinary-user and admin login, unverified login, direct admin links, revoked admin claim, logout and account switching. Confirm no stale account data or duplicate listeners.
2. Normal-user Home, session creation/edit, recording acceptance, offline retention/upload retry, playback, transcription, metrics, AI feedback/retry, Progress, Profile and name editing.
3. Recording and session deletion across both audio layouts; failed deletion must retain its marker and retry safely.
4. Admin search/filter/pagination, user details, activity filters, unavailable metrics, offline/error states, and back/settings navigation.
5. Suspension/reactivation with an already signed-in user, cached ID token, pending upload, recording deletion and AI retry. Test repeated operation IDs, double-taps, remounts, network loss, partial failure and concurrent administrators. Confirm exactly one activity event and safe unresolved locks.
6. Physical iPhone/Expo Go: microphone permission, record/continue/navigation/unmount, playback, native UUID generation, admin confirmation/retry UI, narrow-screen layout, keyboard and safe areas.

No production, physical-device, live Deepgram/Gemini, deployed rules, trigger delivery, IAM or infrastructure validation is claimed. Future deployment requires a separately approved plan, compatible rules/Functions, reviewed activity indexes, existing secret bindings, authorized admin claims and an operational recovery procedure. No change to main is recommended until blockers and manual E2E validation are complete.

## Changed files

61 changed paths relative to the pre-merge destination. A = added; M = modified.

```text
A	.firebaserc
M	CLAUDE.md
A	SPEAKSHARP_ADMIN_HANDOVER.md
M	app/(tabs)/_layout.js
M	app/_layout.js
A	app/admin-demo.js
A	app/admin/(tabs)/_layout.js
A	app/admin/(tabs)/activity.js
A	app/admin/(tabs)/index.js
A	app/admin/(tabs)/users.js
A	app/admin/_layout.js
A	app/admin/users/[userId].js
M	app/index.js
A	components/admin/ActivityRow.js
A	components/admin/AdminHeader.js
A	components/admin/StatusBadge.js
A	components/admin/UserListItem.js
A	components/screens/AdminActivityScreen.js
A	components/screens/AdminDashboardScreen.js
A	components/screens/AdminUserDetailsScreen.js
A	components/screens/AdminUserDetailsScreen.test.js
A	components/screens/AdminUsersScreen.js
M	components/screens/HomeScreen.js
M	components/screens/SessionsScreen.js
A	constants/mockAdminAccess.js
M	context/AuthContext.js
A	context/AuthContext.test.js
A	docs/Admin_Guide.md
A	docs/admin-merge-report.md
M	firebase.json
M	firestore.rules
A	functions/admin.js
A	functions/admin.test.js
A	functions/adminAccountStatusOperations.emulator.test.js
A	functions/adminAccountStatusOperations.js
A	functions/adminAccountStatusOperations.test.js
A	functions/adminActivity.js
A	functions/adminActivity.test.js
A	functions/adminAuthorization.js
A	functions/adminAuthorization.test.js
A	functions/adminReadOnly.js
A	functions/adminReadOnly.test.js
A	functions/adminSuspension.js
A	functions/adminSuspension.test.js
A	functions/adminUsers.js
A	functions/adminUsers.test.js
M	functions/deletion.js
A	functions/deletion.test.js
M	functions/index.js
M	functions/test/rules.test.js
A	hooks/useAdminAccess.js
A	jest.component.config.js
M	package-lock.json
M	package.json
A	services/accountStatusOperationStore.js
A	services/accountStatusOperationStore.test.js
A	services/adminService.js
A	services/adminService.test.js
A	services/operationId.js
A	services/operationId.test.js
A	tests/firestore.rules.test.js
```
