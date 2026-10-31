# Academic demo verification

Date: 2026-10-31. Scope: existing admin and normal-user happy paths, per the user's revised instruction. No Storage redesign, media gateway, token migration, pipeline changes, production changes, commit or push.

## Result

Ready for an academic-demo-scoped ARMONY commit after review, with the documented security exceptions retained. Ready for the next manual testing phase once deployment and live test-account actions are separately authorized. This is not full suspension security acceptance or deployment approval.

The existing merge is preserved: ARMONY HEAD `68ffc251e591b6a05ead0a3513ff68cfb14e9983`, MERGE_HEAD `c703c41fcfa796dcd98b2c7243dbc59eb840e2a1`. No unresolved Git conflicts. This follow-up remains unstaged alongside the existing staged integration. main and origin/main remain locally at `b4849fc3468702080da52b8638a151c92f73326b`; no branch was committed or pushed.

## Minimal application fix

`components/screens/AdminUserDetailsScreen.js` now passes Expo Crypto to the existing operation-ID generator. The previous call relied on global Web Crypto, which is not reliably available in the native React Native environment. Secure UUID generation is required before the UI can persist an operation and call setUserDisabled. The existing generator, ID format, persistence, locking, retries and callable interfaces are unchanged.

`package.json` and `package-lock.json` add only the SDK-compatible `expo-crypto ~58.0.7` runtime dependency. No other locked dependency version changed in this follow-up. [Expo SDK 58 Crypto documentation](https://docs.expo.dev/versions/v58.0.0/sdk/crypto/) documents the native UUID API and Expo Go support. A custom development client must be rebuilt to include the native module; an iOS JavaScript export alone is not a native build.

Other changes are verification/documentation only:

- `components/screens/AdminUserDetailsScreen.test.js`: exercise native UUID adapter while retaining the existing operation/retry tests.
- `tests/adminDemo.test.js`: 13 component/navigation checks covering guest/unverified/user/admin routes, protected admin access, dashboard data, directory search/details navigation and logout.
- `functions/test/adminDemo.emulator.test.js`: Auth + Firestore workflow with real emulator sign-ins, verified token claims and the actual admin handlers/operation manager. Checks directory/search/details, session count, rejection of ordinary users and self-suspension, suspension/fresh-login denial, reactivation/fresh-login success, idempotent retry, activity and logout.
- `firebase.test.json`: add local Auth emulator on 127.0.0.1:9099. Existing rules tests still start only Firestore/Storage.
- `package.json`: add `test:admin-demo`, explicitly selecting demo-speaksharp and local Auth/Firestore.
- This report, `docs/admin-merge-report.md` and `SPEAKSHARP_ADMIN_HANDOVER.md`: record the narrower acceptance and retained security exception.

## Local results

| Check | Result | Boundary |
| --- | --- | --- |
| Normal-user Functions/recording/metrics/AI/deletion/progress/account suites | 158 passed | Providers mocked; no Deepgram/Gemini calls |
| Admin backend, authorization, account operations, activity and session deletion | 102 passed | Unit tests |
| Operation ID/store and attempt-flow presentation | 17 passed | Unit tests |
| Auth context, admin service/details and new demo UI/navigation | 36 passed | Jest; service/router/native adapters mocked |
| Existing Firestore/Storage rules and operation concurrency | 28 passed | Local emulators |
| New Auth + Firestore demo integration | 8 passed (7 scenarios plus parent test) | Real emulator Auth and Firestore; handlers invoked directly, not callable HTTP transport |
| Total regression/demo checks | **349 passed, 0 failed, 0 skipped** | Does not include separate security audit |
| Separate advanced suspension audit | **4 passed, 12 failed** | Intentional denial assertions retained: 11 application gaps and one emulator lookup-limit discrepancy |
| Root and Functions dependency trees | Passed | npm ls --depth=0 |
| iOS/Hermes export | Passed | dist/admin-demo-ios; no physical device/native build |
| Whitespace/conflict and pipeline preservation checks | Passed | No processor, Storage rules or shared account-data changes |
| Live Firebase, existing demo admin and physical iPhone | Not run | Explicitly outside current authorization |

The new UI test initially queried “View Users” instead of the existing “View All Users” label; corrected the test, with no UI change, and reran all four Jest suites successfully. The first dependency install was blocked by network sandbox permissions and the first iOS export by Hermes execution permissions; permitted retries succeeded. No production logic was changed to silence a test.

Installation reported 54 dependency advisories (1 low, 44 moderate, 8 high, 1 critical); these are not resolved or security-triaged here. No blanket audit fix or dependency upgrade was applied. The earlier integration check also identified existing Expo/audio/router patch drift; it was not rerun or upgraded in this demo pass.

The unchanged advanced security suite remains separate from regression scripts. Its failing assertions were neither disabled nor weakened. See [security investigation](account-suspension-security.md) for the full interpretation. Passing the Auth workflow proves fresh-login suspension locally, not termination of all existing sessions or recording access.

## Reproduce

Use Node 22 and Java 21, the installed packages and the configured emulator cache. Run emulator suites sequentially:

```powershell
npm.cmd test --prefix functions
$adminTests = Get-ChildItem functions -Filter '*.test.js' | Where-Object Name -notlike '*.emulator.test.js' | ForEach-Object FullName
node --test @adminTests services/operationId.test.js services/accountStatusOperationStore.test.js tests/attemptFlowPresentation.test.cjs
npx.cmd --no-install jest --config jest.component.config.js --runInBand --testTimeout=15000 components/screens/AdminUserDetailsScreen.test.js services/adminService.test.js context/AuthContext.test.js tests/adminDemo.test.js
npm.cmd run test:rules
npm.cmd run test:admin-demo
```

The demo integration asserts exact loopback emulator endpoints before making requests, uses a hardcoded demo project and creates disposable emulator-only accounts. It never reads or changes Hlax's account. The security audit's separate reproduction command is in its report and is expected to exit nonzero.

## Before live testing (not performed)

1. Confirm the required merged backend is deployed in speaksharp-3893c: getAdminStats, getUsers, getUserDetails, getActivityLogs, setUserDisabled, recordSessionCreated, and the integrated deleteSession, preserving all existing recording/AI exports and secret bindings. The admin client uses us-central1. Local tests do not establish deployed versions or callable transport/IAM availability. Do not broadly redeploy the unchanged pipeline just for this client fix.
2. Confirm the merged Firestore rules are deployed, including the server-only disabled field, active-profile checks and admin collection restrictions. No Storage-rule change was made; deploying unchanged rules cannot close the suspension gap.
3. Verify activity queries have the required deployed Firestore indexes. There is no index manifest here, and the emulator does not establish production composite-index readiness. Dashboard session counts and directory/details are the primary demo path; several other dashboard/detail metrics intentionally show Unavailable, and recording/analysis activity producers are not implemented.
4. Install the locked frontend dependencies and run a compatible SDK 58 client. Use a rebuilt development client if needed for expo-crypto. Physical iPhone verification is outstanding.

## Existing admin account checklist

Use Hlax's existing account in speaksharp-3893c. Do not create another live admin or modify credentials/custom claims as part of this task.

- Confirm Email/Password sign-in is enabled and Hlax can sign in with the existing credentials, entered privately in the app.
- Confirm its current Firebase Auth record has emailVerified === true, disabled === false and customClaims.admin === true (boolean). The backend checks the live record as well as the token claim.
- Confirm a fresh ID token contains admin: true and the app opens /admin. The existing AuthContext refreshes claims; a fresh sign-in also avoids stale claims. Do not rely on a Firestore role field or the admin-demo route as proof of privileges.
- Confirm the frontend points to the same project and the callables are reachable. The local .env project ID is speaksharp-3893c; the live account/configuration was not queried.
- Prepare a separate, verified normal test account with a users/{uid} profile, disabled false or absent, and no admin claim. Get authorization before creating or modifying any live account; these actions were not performed here.

## First manual rehearsal after authorization

1. Admin login -> dashboard session count -> directory -> search the normal test account -> details. Confirm the unavailable statistics are expected.
2. Suspend only that normal test user. Confirm one success/activity event, then sign the normal user out and attempt a fresh login on a separate device/session: it should be rejected.
3. Reactivate the same user, then confirm fresh login succeeds. Never use the admin as the suspension target.
4. Normal-user Home -> create/open session -> record/upload -> Deepgram transcript -> metrics -> Gemini feedback -> playback -> Progress -> Profile/Edit Profile. Check actual devices and providers; local regression tests do not prove this deployed path.
5. Admin logout and account switch: verify protected routes close and no old account data remains.

Known limitation remains explicit: cached tokens/retained download URLs can retain Storage access; deleteRecording and retryRecordingAnalysis lack current suspension checks. Already accepted background work can continue. The academic demo demonstrates fresh-login suspension, not comprehensive account-resource revocation. Full security acceptance and eventual main/production integration remain separate unresolved work.
