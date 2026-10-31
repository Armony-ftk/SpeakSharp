# SpeakSharp: Admin Frontend Rules

Project: React Native + Expo SDK 57 + Expo Router, with Firebase Auth/Firestore.
Full spec: `docs/ADMIN_GUIDE.md` (the SpeakSharp Admin UI/UX Frontend Implementation Guide). Read it before starting any admin task.


## My role and scope
- I am the **frontend developer only**. The user side already exists and must keep working.
- In scope: 4 admin screens (Dashboard, Users, User Details, Activity), the admin route group, 3 admin tabs, reusable admin components, and all UI states (loading / empty / error / offline / forbidden).
- Out of scope: backend, Cloud Functions, Firebase Admin SDK, Firestore rules, custom-claim provisioning, a separate admin login or sign-up, new Firebase projects, analytics, payments, moderation.
- Backend and services work belongs to **Hlax**. Root auth routing merges are reviewed by the **group lead**.


## Hard rules
1. **Inspect before editing.** Confirm the real routing root (`app/` or `src/app/`), existing layouts, auth context, and shared components. The folder tree in the guide is a recommendation, not a fact.
2. **Never rename or move existing user routes.** Do not change Home, Sessions, Recording, Transcript, Feedback, Progress, or Profile behavior.
3. **Use Expo Router only.** No standalone React Navigation container. Use `router.push` / `router.back`. Read `userId` from route params, never hardcode it.
4. **No new UI libraries or dependencies** without asking me. Stay compatible with Expo Go.
5. **Reuse existing shared components** (buttons, inputs, typography, spacing, cards, badges). Add admin components only when reusable, under `components/admin/`.
6. **Screens never call Firebase directly.** All data goes through the `adminService` interface. No privileged queries, no Admin SDK, no secrets in the client.
7. **Show a diff before changing shared files** (root `_layout`, auth context). Keep those changes minimal.
8. Do not add dependencies, delete files, or run destructive git commands without asking.

## Routes (adapt names to the actual repo)
```
(admin)/_layout.jsx          protected Stack
(admin)/(tabs)/_layout.jsx   Tabs: Dashboard | Users | Activity
(admin)/(tabs)/index.jsx     Dashboard
(admin)/(tabs)/users.jsx     User directory
(admin)/(tabs)/activity.jsx  Activity feed
(admin)/users/[userId].jsx   User Details (pushed screen)
```
Keep route files thin: extract params, render a screen component.

## Service contract (`services/adminService.js`)
The mock and the future Firebase implementation must return **identical shapes**.
- `getAdminStats()` -> `{ totalUsers, totalSessions, totalRecordings, recentlyActiveUsers, activityWindowDays, recentActivity[] }`
- `getUsers({ search, status, pageSize, cursor })` -> `{ items[], nextCursor, total? }`
- `getUserDetails(userId)` -> `{ userId, fullName, email, accountStatus, createdAt, totalSessions, totalRecordings, recentActivity[] }`
- `getActivityLogs({ type, userId?, pageSize, cursor })` -> `{ events[], nextCursor }`
- `setUserDisabled(userId, disabled)` -> `{ userId, accountStatus, updatedAt }`

Event shape: `{ id, userId, userName, type, label, occurredAt (ISO), status }`.
The mock layer supports simulated delay and switchable scenarios: success, empty, error, offline, forbidden.


## UX rules
- **Access:** show "Checking access…" while resolving the admin claim. Never flash protected content. Non-admins get redirected or see Access Denied. Hidden tabs are not security.
- **Missing data:** show "—", never 0 or invented numbers. 0 and missing are different.
- **Users:** debounced search (or a Search button); new search/filter resets cursor and results; list is read-only.
- **User Details:** suspend/reactivate needs a ConfirmDialog naming the user and the impact. Disable the button while pending. Show success **only after** the service resolves. On failure, keep the previous status and show an error. Never show the raw UID by default.
- **Activity:** read-only feed, event filter (All | Sessions | Recordings | Analysis | Errors), optional `userId` filter with a clear control. No stack traces or secrets in failed events.
- **Privacy:** never display audio, transcripts, AI feedback text, passwords, or tokens. Metadata only.
- **Offline:** "Admin information requires an internet connection" with Retry. Do not queue privileged writes.
- **Time:** show timestamps in device local time; service values are ISO strings.
- **Terms:** use Active / Suspended / Completed / Failed / Loading consistently.
- **Accessibility:** text labels on buttons and filters, `accessibilityLabel` on icon buttons, comfortable touch targets, never rely on color alone for status, support larger text.
- **Demo data:** show a dev-only "Demo Data" notice while mocked (`__DEV__` only).

## Build order (one phase at a time; stop after each for my review)
1. Admin route group, layouts, role gate (stub `isAdmin`)
2. Mock `adminService` with Section 8 shapes and scenarios
3. Shared components in `components/admin/`
4. Dashboard
5. Users
6. User Details + ConfirmDialog
7. Activity
8. Final check against the acceptance criteria and test scenarios below

## Acceptance checklist
- [ ] Admin reaches the Dashboard with 3 tabs; normal users never see admin content (tabs or deep links)
- [ ] All 4 screens work with mock data, including empty and error states
- [ ] No dead or decorative controls
- [ ] Users -> Details and Activity -> Details both use route `userId`
- [ ] Suspend/reactivate: confirm required, success only after the service responds
- [ ] No Firebase or Admin SDK code inside screen components
- [ ] Existing user flows are untouched
- [ ] Still runs in Expo Go

## Test scenarios to verify
| Scenario | Expected |
|---|---|
| Admin logs in | Dashboard, 3 tabs |
| Non-admin hits an admin route | Redirect/deny, no data fetched |
| Dashboard data unavailable | Loading, then fallback or error (no fake totals) |
| Search returns zero users | "No matching users" + Clear Filters |
| Suspension cancelled | No service call, user stays Active |
| Suspension succeeds | Status updates after server confirms |
| Suspension rejected | Error shown, previous status kept |
| Network disconnected | Clear online-required message |
| Activity empty | "No activity" state |
| Admin claim revoked | Access denied on refresh |

## Working style
- Ask me when something is ambiguous. Don't guess at the repo structure.
- Keep changes small and focused. Summarize what changed and which files at the end of each phase.
- Git: work on `feature/admin-ui`. No force-push to main.
