// Mock data standing in for a real session-details API, keyed by session id.
export const SESSIONS = {
  1: {
    title: "DSW Final Presentation",
    status: "Active",
    date: "20 September",
    targetMinutes: 8,
    attempts: 4,
    latestScore: 8.1,
    bestScore: 8.4,
    ratingFrom: 6.2,
    ratingTo: 8.1,
    ratingDelta: "+1.9 points since Attempt 1",
    improvements: [
      {
        label: "Filler words",
        meta: "14 fewer",
        before: "Attempt 1: 22",
        after: "Latest: 8",
      },
      {
        label: "Speaking pace (WPM)",
        meta: "8 WPM slower",
        before: "Attempt 1: 127",
        after: "Latest: 119",
      },
      {
        label: "Timing vs Target (8:00)",
        meta: "Closer to target",
        before: "Attempt 1: 8:31 (+31s)",
        after: "Latest: 7:48 (-12s)",
      },
    ],
    previousAttempts: [
      { number: 4, title: "Attempt 4 (Latest)", timestamp: "Today, 10:42 AM" },
      { number: 3, title: "Attempt 3", timestamp: "18 Sep, 4:15 PM" },
      { number: 2, title: "Attempt 2", timestamp: "17 Sep, 9:30 AM" },
    ],
  },
  2: {
    title: "Database Presentation",
    status: "Active",
    date: "25 September",
    targetMinutes: 6,
    attempts: 2,
    latestScore: 6.8,
    bestScore: null,
    ratingFrom: 5.9,
    ratingTo: 6.8,
    ratingDelta: "+0.9 points since Attempt 1",
    improvements: [
      {
        label: "Filler words",
        meta: "4 fewer",
        before: "Attempt 1: 12",
        after: "Latest: 8",
      },
      {
        label: "Speaking pace (WPM)",
        meta: "3 WPM slower",
        before: "Attempt 1: 133",
        after: "Latest: 130",
      },
      {
        label: "Timing vs Target (6:00)",
        meta: "Closer to target",
        before: "Attempt 1: 6:40 (+40s)",
        after: "Latest: 6:15 (+15s)",
      },
    ],
    previousAttempts: [
      { number: 2, title: "Attempt 2 (Latest)", timestamp: "25 Sep, 1:20 PM" },
      { number: 1, title: "Attempt 1", timestamp: "22 Sep, 5:05 PM" },
    ],
  },
};

export function getSession(id) {
  return SESSIONS[id] ?? SESSIONS["1"];
}

// Adds a brand new session to the in-memory mock store and returns its id.
export function createSession({ title, description, targetMinutes, date }) {
  const id = `new-${Date.now()}`;
  SESSIONS[id] = {
    title,
    description,
    status: "Active",
    date,
    targetMinutes,
    attempts: 0,
    latestScore: null,
    bestScore: null,
    ratingFrom: 0,
    ratingTo: 0,
    ratingDelta: "No attempts yet",
    improvements: [],
    previousAttempts: [],
  };
  return id;
}

// Mutates a session in the in-memory mock store (e.g. marking it completed).
export function updateSession(id, patch) {
  const session = SESSIONS[id];
  if (!session) return null;
  Object.assign(session, patch);
  return session;
}

export function deleteSession(id) {
  delete SESSIONS[id];
}
