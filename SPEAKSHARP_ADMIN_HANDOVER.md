# SpeakSharp Admin Implementation Handover

## 1. Purpose and status

This handover covers the local SpeakSharp administrator implementation: protected admin navigation, dashboard statistics, user directory and details, activity logs, account suspension/reactivation, and the supporting security and retry infrastructure.

The implementation and tests described here are local repository work. Passing local unit tests and Emulator tests do not prove that the corresponding Firebase Functions, triggers, IAM policies, or Firestore rules are deployed and working in the production Firebase project.

## 2. Frontend functionality

The admin frontend includes:

- Role-aware routing and protected admin layouts.
- Admin dashboard statistics and recent activity display.
- User directory with search, status filtering, and pagination.
- User details with profile metadata, session metadata, recent activity, and account status.
- Suspension and reactivation controls.
- Settings navigation and direct logout in the admin header.
- Activity-row rendering for trusted `suspend` and `reactivate` actions.
- Firebase callable adapters in `services/adminService.js` using the `us-central1` Functions instance.

The account-status UI persists only the operation ID, target user ID, and requested disabled state. It saves a new attempt before calling the backend, reuses unresolved IDs after remount, refuses conflicting unresolved actions, and clears the record only after confirmed backend success.

## 3. Backend Functions

The current local exports in `functions/index.js` include:

- `getAdminStats`
- `getUsers`
- `getUserDetails`
- `getActivityLogs`
- `setUserDisabled`
- Existing `deleteSession`
- `recordSessionCreated` trigger

The admin read callables return metadata-only responses. The suspension callable updates Firebase Authentication and the Firestore profile mirror according to the established operation order, verifies the final state, and completes the operation only through the validated transaction helper.

## 4. Authorization and security

`functions/adminAuthorization.js` is the shared authorization boundary. It verifies the caller is authenticated, retrieves the current Firebase Authentication user record, rejects disabled accounts, requires `emailVerified === true`, and requires the current `admin: true` custom claim.

Admin callables authorize before protected data reads. The suspension callable additionally:

- Rejects self-suspension or self-reactivation.
- Rejects targets with the current administrator claim.
- Validates user IDs, the boolean `disabled` value, and the operation ID.
- Derives the actor ID from the trusted authorization result.

The frontend route guard is not a security boundary; Firebase callable authorization remains authoritative.

## 5. Suspension and reactivation

`setUserDisabled` preserves the successful response shape:

```js
{ userId, accountStatus, updatedAt }
```

Suspension sequence:

1. Authorize the administrator and validate the request.
2. Read the target Auth account and required profile.
3. Claim the operation and per-user lock transactionally.
4. Set `users/{uid}.disabled` to `true`.
5. Disable the Firebase Auth account.
6. Revoke refresh tokens.
7. Verify both Auth and Firestore final state.
8. Atomically store the result, write the metadata-only activity event, and release the lock.

Reactivation enables Auth first, then clears the Firestore mirror, verifies both states, and completes through the same validated transaction.

Firebase Auth and Firestore are not atomic. If a mutation or completion fails, the operation remains unresolved for trusted recovery and the callable does not report success. Automatic stale-lock takeover and automatic repair are intentionally not implemented.

## 6. Activity logging

The server-owned `adminActivityLogs` collection is read through the authorized `getActivityLogs` callable. Direct client reads and writes are denied by local Firestore rules.

Trusted event sources currently include:

- Session creation through the `recordSessionCreated` Firestore trigger.
- Account suspension through `setUserDisabled`.
- Account reactivation through `setUserDisabled`.

Account-status event IDs are deterministic from the operation ID, and completion is transactional to prevent duplicate events. The serializer exposes only the approved `suspend` and `reactivate` action values for `Admin` events; it does not expose `actorId` or `source`.

Recording-created, analysis-completed, and analysis-failed event producers are not confirmed as implemented. The activity endpoint must not be treated as comprehensive for those categories.

## 7. Firestore rules

The local `firestore.rules` implementation:

- Allows active users to access their own profile and sessions.
- Treats a missing `disabled` field as active during the transition period.
- Blocks users whose profile has `disabled: true` from profile/session access.
- Preserves profile, timestamp, session, rating, and attempt-count validation.
- Prevents clients from creating, changing, removing, or adding the server-managed `disabled` field.
- Keeps role/admin fields outside ordinary client writes.
- Explicitly denies direct client access to `adminActivityLogs`, `adminAccountStatusOperations`, and `adminAccountStatusLocks`.

The rules Emulator suite passed locally. Deployment of these rules still requires group-lead verification.

## 8. Supporting services

- `services/operationId.js` creates `op_`-prefixed UUID v4 operation IDs.
- `services/accountStatusOperationStore.js` persists unresolved attempts in AsyncStorage, isolated by target user.
- `functions/adminAccountStatusOperations.js` provides transactional operation binding, per-user locking, deterministic completion, and idempotent activity-event creation.
- `functions/deletion.js` checks current Auth disabled state and the Firestore profile mirror before deleting a user's own session and associated files.

The operation helper intentionally has no automatic expiry or stale-lock takeover. A trusted manual recovery process remains a future operational requirement.

## 9. Test evidence

The latest reported local results are:

| Area | Result |
|---|---:|
| Activity tests | 13/13 passed |
| Non-Emulator Functions suite | 101/101 passed |
| Admin service adapters | 9/9 passed |
| Admin user-details component tests | 10/10 passed |
| Operation ID and persistence tests | 10/10 passed |
| Firestore rules Emulator tests | 10/10 passed |
| Account-operation concurrency Emulator test | 1/1 passed |
| Functions dependency installation under Node 22 | Passed |
| `git diff --check` | Passed; only existing LF/CRLF warnings |

The concurrency test proves the claim transaction behavior exercised by that test. It does not prove the complete Auth/Firestore workflow is globally concurrency-safe or production-deployed.

## 10. Node.js and dependency cleanup

The Functions package declares Node `22` and was verified with Node `v22.22.1` and npm `10.9.4`.

The unnecessary `speaksharp_app: "file:.."` dependency was removed from:

- `functions/package.json`
- `functions/package-lock.json`

The root `package.json` and root `package-lock.json` were not changed by this cleanup. The Functions lockfile no longer has an active parent-app dependency or linked package, although npm retains old parent metadata marked extraneous.

## 11. Files to include

Include the following implementation and test areas:

- `app/` admin and authentication routing changes.
- `components/admin/` and the admin screens/tests.
- `context/AuthContext.js` and `hooks/useAdminAccess.js`.
- `services/adminService.js`, `services/adminService.test.js`, `services/operationId*`, and `services/accountStatusOperationStore*`.
- `functions/index.js`, `functions/deletion.js`, all `functions/admin*.js` modules, their tests, and the account-operation Emulator test.
- `firestore.rules` and `tests/firestore.rules.test.js`.
- `firebase.json`.
- Root and Functions package manifests/lockfiles.
- `jest.component.config.js`.
- `.firebaserc`, subject to project-target confirmation.

## 12. Files to exclude or keep deleted

Exclude generated local logs:

- `firestore-debug.log`

Keep the generated CLI log deleted:

- `firebase-debug.log`

Do not recreate previously deleted backups.

## 13. Production deployment and verification

The group lead should:

1. Confirm `.firebaserc` targets the intended Firebase project.
2. Review the complete diff and exclude generated logs.
3. Resolve Cloud Run invocation/IAM permissions without weakening callable authorization.
4. Deploy the approved Functions in `us-central1`.
5. Verify `getAdminStats`, `getUsers`, `getUserDetails`, `getActivityLogs`, and `setUserDisabled` in the deployed environment.
6. Verify the `recordSessionCreated` trigger.
7. Deploy and verify Firestore rules separately.
8. Confirm unauthenticated and non-admin requests are rejected.
9. Verify suspension/reactivation with real Auth and Firestore state checks.
10. Inspect deployed logs for callable authentication, `requireAdmin`, Firestore, and Cloud Run invocation failures.

No claim is made here that the complete admin implementation is deployed or production-verified.

## 14. Known limitations

- Firebase Storage upload/download functionality and Storage rules are not implemented in this handover.
- Recording and analysis lifecycle event producers are incomplete or unverified.
- Pending account-status operations require trusted manual recovery; automatic stale-lock recovery is intentionally absent.
- Local Emulator rules tests do not prove deployed rules are active.
- Local mocked Functions tests do not prove deployed callable IAM or Cloud Run invocation behavior.
- A successful local test suite does not establish production data correctness or deployment readiness.

## 15. Group-lead handover checklist

- [ ] Confirm Firebase project and branch contents.
- [ ] Review all modified and untracked implementation files.
- [ ] Exclude `firestore-debug.log` and retain deletion of `firebase-debug.log`.
- [ ] Confirm the Functions lockfile cleanup.
- [ ] Resolve Cloud Run invoker/IAM permissions.
- [ ] Deploy only the approved Functions and triggers.
- [ ] Verify callable authentication and admin authorization in production.
- [ ] Verify Firestore rules deployment and suspended-user access behavior.
- [ ] Verify suspension/reactivation partial-failure behavior and recovery procedures.
- [ ] Decide the later recording, Storage, and analysis-event milestone.
