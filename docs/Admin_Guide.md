




SPEAKSHARP
Admin Side — UI/UX Screens & App Flow Guide
For the Design & Frontend Implementation Team


DELIVERABLE	PROJECT BASELINE
4 admin screens + role-based navigation	React Native • Expo SDK 57 • Expo Router
Dashboard • Users • User Details • Activity	Firebase Auth • Firestore • Cloud Functions
Frontend scope	UI, routing, state handling and mock-data integration

ADMIN MVP FLOW
Existing Login → Verify Admin Role → Admin Dashboard → Users / Activity → User Details

This guide defines screens, behaviour, architecture boundaries and backend contracts.
It does not prescribe colours, branding, visual styling or finished component shapes.

 1. How to Use This Guide
This document extends the approved SpeakSharp user-side UI/UX guide with a small administration interface. The existing practice experience remains unchanged: Authentication → Home → Session → Recording Attempt → Transcript → AI Feedback → Progress. The new admin experience is available only to authorised administrator accounts.
The frontend team should implement the four screens, navigation and all common UI states using mock data that matches the contracts in Section 8. Hlax can then connect secure Firebase operations without rebuilding those screens.
1.1 What is in scope
•	Admin Dashboard: platform totals, recent activity and shortcuts.
•	User Management: user directory, search and account-status filter.
•	User Details: profile/usage summary, activity and suspend/reactivate confirmation.
•	Activity Monitoring: filterable list of session, recording, analysis and error events.
•	Integration-ready screen components, loading/empty/error/offline states, and admin-only routes.
1.2 What is out of scope
•	A second application, separate admin login, admin sign-up or a new Firebase project.
•	Complex analytics, editing other users’ recordings or transcripts, payment data or moderation workflows.
•	Implementing Firebase Admin SDK inside Expo, designing security rules or producing Cloud Function logic.
•	New UI libraries unless explicitly approved by the group lead.
1.3 Architectural facts and assumptions
CONFIRMED	TO VERIFY BEFORE MERGING
package.json main = expo-router/entry; expo-router ~57.0.19. Expo Router handles routes and uses React Navigation internally.	Current app/ or src/app/ route tree, current layout names, existing authentication context and component naming.
Existing Firebase Auth, Firestore users/sessions/recordings hierarchy and callable functions.	Exact UI component library, implementation of session timestamps and admin access-claim refresh.
Important: the route tree below is a recommended extension, not a claim that those paths already exist. Preserve existing routes and adapt names to the actual repository.
2. Navigation Structure & Role Flow
Recommended admin navigation: Dashboard | Users | Activity (three tabs). User Details is a pushed screen, reached by tapping a user. Existing Login/Register/verification screens stay shared. No “Register as Admin” option.
APP START
  → Existing Firebase auth restoration + email verification checks
  → Resolve admin custom claim (online when possible)
       ├─ admin = true  → ADMIN AREA
       │                  Dashboard ↔ Users ↔ Activity
       │                                  ↓
       │                             User Details
       └─ normal user   → EXISTING USER AREA
                           Home ↔ Sessions ↔ Progress ↔ Profile


 3. Expo Router Folder & Integration Guide
This application uses Expo Router. Do not introduce a standalone React Navigation container or hand-maintained screen registry. Place route files under the project’s existing routing root (usually app/; sometimes src/app/) and use Expo Router layouts.
SpeakSharp/
├── app/                               # or existing src/app/
│   ├── _layout.jsx                    # existing root gate; modify carefully
│   ├── (auth)/ ...                    # existing authentication routes
│   ├── (user)/ ...                    # schematic: KEEP existing user routes
│   └── (admin)/                       # NEW: admin route group
│       ├── _layout.jsx                # protected admin Stack layout
│       ├── (tabs)/
│       │   ├── _layout.jsx            # admin Tabs: 3 destinations
│       │   ├── index.jsx              # dashboard
│       │   ├── users.jsx              # user directory
│       │   └── activity.jsx           # platform activity
│       └── users/
│           └── [userId].jsx           # user details, stacked
├── components/admin/                 # stat cards, rows, badges, filters
├── services/adminService.js          # future/backend-facing API adapter
├── hooks/ ...                        # optional admin screen data hooks
├── context/ ...                      # reuse existing auth context
└── functions/ ...                    # Hlax owns secure admin functions

Folder (admin) is an organisational route group, not a security boundary or URL prefix. If any path collides with an existing route, the frontend lead must adapt the grouping while retaining one clear admin route hierarchy.
3.1 Route implementation boundaries
LAYER	FRONTEND TEAM	HLAX / BACKEND
Route files and layouts	Build screen routes, tabs, stack/back behaviour, conditional rendering	Confirm role/claim contract
Reusable components	StatCard, UserListItem, ActivityRow, StatusBadge, ConfirmDialog	No styling responsibilities
Screen data access	Use adminService adapter or mock implementation; no direct privileged reads	Implement callable functions or protected queries and adapter
Security	Display denied/offline feedback; never claim UI guards are security	Custom claims, Firestore rules, callable authorisation, account disable
3.2 Route and naming practices
•	Keep route files thin: route extracts parameters and renders an admin screen component.
•	Use router.push and router.back from expo-router; read userId from route params, never from a hardcoded test identifier.
•	Prefer existing shared typography, spacing, inputs and button components. Add admin-specific components only when reusable.
•	Do not rename or move existing user routes merely to make the new tree symmetrical.

 4. Core Admin Experience
EXISTING LOGIN
  ↓
Verified admin?  ── no ──→ Existing user experience / access denied
  │ yes
  ↓
ADMIN DASHBOARD
  ├── Tap USERS tab → Search/Filter → Tap user → USER DETAILS
  │                                            └── Suspend/Reactivate → Confirm
  ├── Tap ACTIVITY tab → Filter by event type → Inspect recent events
  │                                            └── Tap user → USER DETAILS
  └── Tap recent activity → USER DETAILS
  ↓
Logout → Existing login

4.1 Global information rules
•	“User” is a registered SpeakSharp account; “Practice Session” is one presentation; “Recording/Attempt” is one take inside a session.
•	Show counts as platform totals; if unavailable, show a placeholder or “—”, not made-up production numbers.
•	Activity time should be shown in the device’s local time zone; service values should use unambiguous ISO timestamps.
•	Use clear human-readable states: Active, Suspended, Completed, Failed, and Loading.
•	Never present audio, transcript text, AI feedback content, passwords or authentication tokens on admin screens.
4.2 Access and navigation notes
•	Show “Checking access…” while resolving the admin claim; never briefly reveal a protected screen.
•	A Dashboard or Activity user event opens User Details with userId; Back returns to the previous tab.
•	Logout reuses the current auth flow. Direct admin links by non-admin users redirect or show Access Denied.
•	Online access denial must never rely only on hidden tabs or buttons.
4.3 Common top-level administration components
COMPONENT	USED ON	DATA / BEHAVIOUR
AdminHeader	All admin screens	Title, signed-in admin identifier or menu, optional logout
StatCard	Dashboard, User Details	Label, number, optional icon, loading skeleton
UserListItem	Users, recent activity	Name, email or action, status and navigation action
ActivityRow	Dashboard, Activity, Details	Display name, event label, timestamp, event status
StatusBadge	Users, Details, Activity	Active/Suspended or processing event severity
EmptyState / ErrorState	Every screen	Explanation, retry or navigation action
ConfirmDialog	User Details	Target name, impact warning, confirm/cancel and progress

 5.1 Admin Dashboard
Route: (admin)/(tabs)/index.jsx
Purpose: Give an administrator a simple overview of the platform and quick access to monitoring and user management. It is a platform activity summary—not the normal user’s practice dashboard.
What should be on it
•	Header with “Admin Dashboard”, a small admin label and accessible logout option.
•	Four statistics cards: Total Users, Total Practice Sessions, Total Recording Attempts and Recently Active Users.
•	Explicit time window beside “Recently Active Users” (recommended: last 7 days).
•	Recent Activity preview of the latest 3–5 events, including user, action, timestamp and status where relevant.
•	Shortcut/link: View All Users and View All Activity.
Main admin actions
•	Switch to Users or Activity tabs; tap a recent event to open that user’s details when userId exists.
•	Refresh dashboard values using a visible refresh action or pull-to-refresh; log out.
UI/UX notes and states
•	Four cards can form a two-column grid on phones; allow labels/numbers to wrap on narrow screens.
•	Use skeletons during loading; show “No recent activity yet” for an empty feed.
•	If one metric is missing, retain the other cards and show “—” for the unavailable value; do not treat 0 and missing as the same.
•	If a request fails, show an inline retry control. If offline, indicate “Connect to the internet to view platform statistics”.
Low-fidelity layout idea — structure only, not final visual design
┌─────────────────────────────────────┐
│ Admin Dashboard              Logout │
│ Overview of SpeakSharp             │
│ ┌──────────────┐ ┌───────────────┐ │
│ │ Total users  │ │ Sessions      │ │
│ │      —       │ │      —        │ │
│ └──────────────┘ └───────────────┘ │
│ ┌──────────────┐ ┌───────────────┐ │
│ │ Recordings   │ │ Active (7d)   │ │
│ │      —       │ │      —        │ │
│ └──────────────┘ └───────────────┘ │
│ Recent activity          View all > │
│ • User A created a session          │
│ • User B saved a recording          │
│ Dashboard       Users      Activity │
└─────────────────────────────────────┘


 5.2 User Management
Route: (admin)/(tabs)/users.jsx
Purpose: Let an administrator find registered users and open one user’s account summary without exposing private practice content.
What should be on it
•	Page title “Users” and small total count, if supplied.
•	Search input with placeholder “Search name or email”.
•	Filter control: All | Active | Suspended (within the same screen; not separate routes).
•	Scrollable, paginated list: display name, email, account status and optionally registration date.
•	Loading indicator at the initial fetch; load-more / infinite-scroll indicator for additional pages.
•	Clear empty and no-results messages, including a way to reset filters.
Main admin actions
•	Type a name/email search, clear search, switch status filter, refresh results and tap a user to open User Details.
•	Load the next page where the backend returns a cursor; navigate back via admin tabs.
UI/UX notes and states
•	Use debounced search or a Search button; do not call the backend for every keystroke.
•	Keep pagination, filtering and searching separate from rendering. New searches reset the cursor and old results.
•	Use only account status that the backend supplies. A local badge is not a substitute for Firebase Authentication status.
•	The user list is read-only; put suspend/reactivate under User Details with a confirmation step.
•	Error state: “Couldn’t load users” + Retry. Offline state: cloud user list unavailable.
Low-fidelity layout idea — structure only, not final visual design
┌─────────────────────────────────────┐
│ Users                               │
│ [ Search name or email...         ] │
│ [ All ] [ Active ] [ Suspended ]     │
│                                     │
│ Amina D.               Active    >  │
│ amina@example.com                   │
│ ─────────────────────────────────── │
│ Daniel P.             Suspended  >  │
│ daniel@example.com                  │
│ ─────────────────────────────────── │
│ Sarah M.               Active    >  │
│ sarah@example.com                   │
│                                     │
│ [ Load more ]                       │
│ Dashboard       Users      Activity │
└─────────────────────────────────────┘


 5.3 User Details
Route: (admin)/users/[userId].jsx
Purpose: Show one user’s account and usage metadata and provide a controlled way to suspend or reactivate the account.
What should be on it
•	Back button, title “User Details”, display name, email and account status badge.
•	Registration date; optionally last activity date only when reliably available.
•	Two usage cards: Total Sessions and Total Recordings.
•	Recent activity for this user, up to a small preview with an “Open Activity” link if implemented.
•	One account-control action: “Suspend Account” for active users or “Reactivate Account” for suspended users.
•	Confirmation dialog that identifies the user and explains the action before applying changes.
Main admin actions
•	Review profile metadata, go back, open the filtered Activity feed and confirm/cancel suspension or reactivation.
•	Retry failed loads or actions; after success refresh user status and user-list/dashboard summaries.
UI/UX notes and states
•	Never show raw UID to users by default; use it only internally to fetch the selected profile.
•	Disable the action button while a suspend/reactivate request is running to prevent repeated calls.
•	If the profile is not found, show a “User not found” state and Back action.
•	Backend must reject self-suspension, attempts to change protected admin accounts and unauthorised calls.
•	Frontend should show the backend’s real outcome; do not optimistically claim “Account suspended” before success.
•	Use no private recordings, audio URLs, transcripts or feedback body. Metadata only.
Low-fidelity layout idea — structure only, not final visual design
┌─────────────────────────────────────┐
│ < Back           User Details       │
│ Sarah M.                [ Active ]   │
│ sarah@example.com                   │
│ Joined: 15 Sep 2026                 │
│                                     │
│ Sessions: —       Recordings: —      │
│                                     │
│ Recent activity                     │
│ • Created practice session          │
│ • Saved recording attempt           │
│ [ View user activity ]              │
│                                     │
│ [ Suspend Account ]                 │
└─────────────────────────────────────┘
Confirmation: “Suspend Sarah M.? This
will prevent access until reactivated.”
[ Cancel ]                  [ Suspend ]


 5.4 Activity Monitoring
Route: (admin)/(tabs)/activity.jsx
Purpose: Allow an administrator to review meaningful app events: session creation, recording saves, completed analyses and processing failures.
What should be on it
•	Page heading “Activity” and a short note that the feed reports recorded system activity, not live microphone monitoring.
•	One event-type filter: All | Sessions | Recordings | Analysis | Errors (compact chips or picker).
•	Chronological feed showing user display name, short event description, event timestamp and optional status.
•	Pagination / load-more behaviour and pull-to-refresh.
•	Optional user filter when entered from User Details; include a clear-filter control.
•	Empty, loading, error and offline states.
Main admin actions
•	Switch event filter, open the associated user when userId is available, refresh, load more and clear user-specific filter.
•	Return to dashboard/users through admin tabs.
UI/UX notes and states
•	Keep the feed read-only. Do not offer editing or deleting user events in the MVP.
•	Use clear event names: “Created session”, “Saved recording”, “Analysis completed”, “Processing failed”.
•	For failed events, show a helpful status label, but do not surface stack traces or secrets.
•	Only show event types actually emitted by the backend. Before integration, mock labels must be marked as demo data.
•	No activity record does not mean the user did nothing; it means no matching event was recorded.
Low-fidelity layout idea — structure only, not final visual design
┌─────────────────────────────────────┐
│ Activity                            │
│ [ All | Sessions | Recordings | ... ]│
│                                     │
│ Amina D.                            │
│ Created a practice session          │
│ Today, 10:32                        │
│ ─────────────────────────────────── │
│ Daniel P.             [ Failed ]    │
│ Recording processing failed         │
│ Today, 09:11                        │
│ ─────────────────────────────────── │
│ Sarah M.                            │
│ Analysis completed                  │
│ Yesterday, 16:28                    │
│ Dashboard       Users      Activity │
└─────────────────────────────────────┘


 6. Common States, Accessibility & Offline
Unlike recording on the normal-user side, admin operations involve viewing other accounts and platform activity. They require fresh, authorised server access. The frontend should not promise offline user management.
STATE	EXPECTED UI BEHAVIOUR
Checking admin role	Full-screen brief loading / “Checking access…”; no protected screen flashes.
Loading data	Screen skeleton or progress; keep title and navigation stable.
Empty results	Explain no users/events match and offer Clear Filters.
Server/network failure	Inline readable error, Retry, no false success state.
Offline	“Admin information requires an internet connection” with reconnect/retry; no privileged writes queued offline.
Forbidden / role removed	Show Access Denied and redirect out of admin routes.
Suspension/reactivation pending	Disable relevant button, show progress, allow clear error feedback.
Successful account change	Show success once server confirms, update status on affected screens.
6.1 Accessibility and consistency requirements
•	Buttons and filters need textual labels, not icons alone; use accessibleLabel/hints for icon buttons.
•	Keep touch targets comfortably tappable, usable with screen readers and responsive to larger text sizes.
•	Use the same account-status terms and activity vocabulary across screens.
•	Confirm destructive or access-restricting operations; make Cancel visually available.
•	Never rely only on colour for Active, Suspended, Failed or Success.
•	If the initial dataset is mocked, show a development-only “Demo Data” notice; do not include it in the production UI.
6.2 Distinguish user offline support from admin offline restrictions
The original SpeakSharp user MVP supports offline recording and local storage. That requirement must remain intact for normal users. Admin dashboard metrics, user enumeration, activity events and account suspension/reactivation are online-only because they depend on authoritative server state and protected cross-user data.

 7. Frontend ↔ Backend Integration Boundaries
The frontend should depend on a single admin service contract. Mock implementations return the same shapes as the eventual Firebase-backed service; replacing the implementation should not require changing screen layouts.
7.1 Recommended service calls
METHOD	INPUT	RETURNS / EFFECT
getAdminStats()	none	Dashboard counts, activity window and recent activity
getUsers(query)	search, status, pageSize, cursor	items[], nextCursor, optional total
getUserDetails(userId)	userId string	Public account metadata, usage and recent activity
getActivityLogs(query)	type, optional userId, pageSize, cursor	events[], nextCursor
setUserDisabled(userId, disabled)	userId and boolean	Server-confirmed accountStatus/updatedAt
7.2 Backend ownership and security expectations
•	Hlax implements the admin service adapter and callable Cloud Functions; frontend developers should not import Firebase Admin SDK into the Expo client.
•	Admin identity is enforced using a Firebase Authentication custom claim, such as admin: true, verified by the server. A Firestore role field is optional display metadata, not authorisation.
•	Only privileged server code can grant/revoke admin access and change Firebase Auth disabled status.
•	Firestore rules and callable functions must prevent cross-user reads/writes by regular users and protect account-status mirror fields from client edits.
•	Where an account-status mirror is used for immediately blocking Firestore access, the backend must maintain it consistently; Auth disable alone may not instantly invalidate previously issued ID tokens.
•	Dashboard aggregate totals and recent-active counts must be defined server-side; frontend must never download everyone’s recordings merely to count them.
•	Never expose server credentials or secrets in the mobile app. Existing user flows must continue operating after integration.
7.3 When contract changes are necessary
If the existing user documents or session/recording timestamps do not support a desired field, mark it optional in the UI rather than inventing data. Agree on the revised field with the group lead before adding a Firebase query or changing the Firestore schema.

 8. Shared Data Shapes (Handoff Contract)
These are proposed presentation-facing payloads for UI development, not assertions about the current Firestore document format. All names, totals and timestamps below are invented test fixtures. Hlax may map Firebase Timestamp objects and nested collections to these normalized responses.
8.1 Dashboard response
{
  "totalUsers": 128,
  "totalSessions": 356,
  "totalRecordings": 642,
  "recentlyActiveUsers": 24,
  "activityWindowDays": 7,
  "recentActivity": [
    {
      "id": "evt_001", "userId": "uid_001",
      "userName": "Amina D.", "type": "session_created",
      "label": "Created a practice session",
      "occurredAt": "2026-10-15T08:32:00Z", "status": "success"
    }
  ]
}

8.2 User directory and user details
// getUsers({ search: "amina", status: "all", pageSize: 20 })
{
  "items": [{
    "userId": "uid_001", "fullName": "Amina D.",
    "email": "amina@example.com", "accountStatus": "active",
    "createdAt": "2026-09-15T12:00:00Z"
  }],
  "nextCursor": null,
  "total": 1
}

// getUserDetails("uid_001")
{
  "userId": "uid_001", "fullName": "Amina D.",
  "email": "amina@example.com", "accountStatus": "active",
  "createdAt": "2026-09-15T12:00:00Z",
  "totalSessions": 3, "totalRecordings": 8,
  "recentActivity": []
}

8.3 Activity page and account changes
// getActivityLogs({ type: "all", pageSize: 20 })
{ "events": [
  { "id": "evt_002", "userId": "uid_002",
    "userName": "Daniel P.", "type": "processing_failed",
    "label": "Recording processing failed",
    "occurredAt": "2026-10-15T07:11:00Z", "status": "failed" }
], "nextCursor": null }

// setUserDisabled("uid_001", true)
{ "userId": "uid_001", "accountStatus": "suspended",
  "updatedAt": "2026-10-15T08:45:00Z" }

9. Implementation Checklist for the Frontend Team
9.1 Before implementation
•	Inspect the actual app/ or src/app/ structure and confirm current layouts, route group naming and auth/verification behaviour.
•	Agree on admin role check contract with the backend; ensure admin verification runs before rendering protected routes.
•	Inspect existing components so the admin UI reuses buttons, badges, typography, cards, spacing and error components.
•	Agree on the Section 8 service contract and on any missing optional fields.
9.2 Build order
1.	Add admin-specific route group, Stack/Tabs layout and role-aware navigation without changing normal-user routes.
2.	Build Admin Dashboard with mock response, including empty/loading/offline/error states.
3.	Build Users with filter/search/list pagination and navigation to User Details.
4.	Build User Details with confirmation dialog and asynchronous action state.
5.	Build Activity with event filters, optional user filtering and pagination.
6.	Connect all screens to one adminService interface. Provide mocked and Firebase-backed implementations with identical return shapes.
7.	Integrate with Hlax’s functions and verify server-side authorization and account-management outcomes.
9.3 Working agreement to reduce merge conflicts
OWNER	PRIMARY FILE AREAS / DELIVERABLE
Frontend team	app/(admin)/..., components/admin/..., admin screen layouts and UI tests
Hlax	services/adminService.js (or agreed API adapter), functions/admin*.js, auth claim provisioning, backend policies
Group lead	Root auth routing merge, shared service contract sign-off, account role provisioning, integration tests
Recommended Git workflow: frontend feature/admin-ui; Hlax feature/admin-backend. Keep shared root _layout and authentication context changes under coordinated review. No force-push to the main branch; merge only after normal-user regression checks.
9.4 Acceptance criteria
•	Admin login reaches the admin Dashboard; normal users never see admin content from tabs or deep links.
•	Each of the four screens renders convincingly using representative mock-data scenarios, including zero and error states.
•	All buttons and navigation destinations work; no dead, decorative controls.
•	Users → User Details and Activity → User Details are functional and use route userId.
•	Suspend/reactivate requires confirmation and shows success only after an authorised backend response.
•	Screen components do not directly contain privileged Firebase queries or Admin SDK code.
•	No interference with existing Home, Sessions, Recordings, Transcript, Feedback, Progress or Profile flows.
•	Expo Go development remains compatible with the existing approved dependencies.

 10. Test Scenarios & Final Admin Screen Map
10.1 Minimum demo/test scenarios
SCENARIO	EXPECTED RESULT
Admin account logs in	Admin Dashboard; 3 admin tabs visible
Normal user attempts admin route	Redirect/deny; protected data not fetched
Dashboard values unavailable	Loading → fallback or error; not fake totals
Search yields zero users	“No matching users” and Clear Filters
Suspension cancelled	No backend call; user remains active
Suspension succeeds	User status updates after server confirmation
Suspension rejected	Error shown; previous status preserved
Network disconnected	Admin pages show clear online requirement
Activity list has no records	Appropriate “No activity” state
Backend revokes admin claim	Admin content denied on token/access refresh
10.2 Final admin navigation map
AUTHENTICATION (existing)
  Login / Email verification
     ↓
  Role-aware access resolution
     ├── USER → existing user tabs and practice flow
     └── ADMIN → Admin Tabs
                  ├── Dashboard
                  │      └── Recent activity → User Details
                  ├── Users
                  │      └── Search / Filter → User Details
                  │                               └── Confirm suspend/reactivate
                  └── Activity
                         └── Filter → User Details

  Logout → Existing Login

10.3 Deliverable and sign-off
Implementation target: four new admin-facing screens, three persistent admin tabs and one detail route. All four screens must be integration-ready and use shared service contracts. The UI guide is complete when the frontend team can demonstrate every screen with realistic fixtures and Hlax can replace the mock service without changing navigation or visual components.
Scope reference: This companion guide follows the original SpeakSharp “UI/UX Screens & App Flow Guide” approach: screen purpose, required content, actions, UI notes, low-fidelity layouts, navigation and consistency rules. The original user-side screens stay as designed.
