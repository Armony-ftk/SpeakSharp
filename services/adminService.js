const MOCK_DELAY_MS = 350;
const MOCK_SCENARIOS = ["success", "empty", "error", "offline", "forbidden"];
let mockScenario = "success";

const mockUsers = [
  {
    userId: "uid_001",
    fullName: "Amina D.",
    email: "amina@example.com",
    accountStatus: "active",
    createdAt: "2026-09-15T12:00:00Z",
    totalSessions: 3,
    totalRecordings: 8,
  },
  {
    userId: "uid_002",
    fullName: "Daniel P.",
    email: "daniel@example.com",
    accountStatus: "suspended",
    createdAt: "2026-08-27T09:30:00Z",
    totalSessions: 5,
    totalRecordings: 11,
  },
];

const mockEvents = [
  {
    id: "evt_001",
    userId: "uid_001",
    userName: "Amina D.",
    type: "session_created",
    label: "Created a practice session",
    occurredAt: "2026-10-15T08:32:00Z",
    status: "success",
  },
  {
    id: "evt_002",
    userId: "uid_002",
    userName: "Daniel P.",
    type: "processing_failed",
    label: "Recording processing failed",
    occurredAt: "2026-10-15T07:11:00Z",
    status: "failed",
  },
  {
    id: "evt_003",
    userId: "uid_001",
    userName: "Amina D.",
    type: "recording_saved",
    label: "Saved a recording",
    occurredAt: "2026-10-14T16:20:00Z",
    status: "success",
  },
  {
    id: "evt_004",
    userId: "uid_002",
    userName: "Daniel P.",
    type: "analysis_completed",
    label: "Analysis completed",
    occurredAt: "2026-10-14T10:05:00Z",
    status: "success",
  },
];

function createScenarioError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function prepareResponse() {
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));

  if (mockScenario === "error") {
    throw createScenarioError("mock/error", "The mock admin service failed.");
  }

  if (mockScenario === "offline") {
    throw createScenarioError(
      "unavailable",
      "Admin information requires an internet connection.",
    );
  }

  if (mockScenario === "forbidden") {
    throw createScenarioError(
      "permission-denied",
      "Admin access is not permitted.",
    );
  }
}

function matchesUser(user, search, status) {
  const normalizedSearch = search?.trim().toLowerCase();
  const matchesSearch =
    !normalizedSearch ||
    user.fullName.toLowerCase().includes(normalizedSearch) ||
    user.email.toLowerCase().includes(normalizedSearch);
  const matchesStatus = !status || status === "all" || user.accountStatus === status;

  return matchesSearch && matchesStatus;
}

export function setMockScenario(scenario) {
  if (!MOCK_SCENARIOS.includes(scenario)) {
    throw new TypeError(
      `Unknown mock scenario "${scenario}". Expected one of: ${MOCK_SCENARIOS.join(", ")}.`,
    );
  }

  mockScenario = scenario;
}

export async function getAdminStats() {
  await prepareResponse();

  if (mockScenario === "empty") {
    return {
      totalUsers: 0,
      totalSessions: 0,
      totalRecordings: 0,
      recentlyActiveUsers: 0,
      activityWindowDays: 7,
      recentActivity: [],
    };
  }

  return {
    totalUsers: mockUsers.length,
    totalSessions: 8,
    totalRecordings: 19,
    recentlyActiveUsers: 2,
    activityWindowDays: 7,
    recentActivity: mockEvents.slice(0, 3),
  };
}

export async function getUsers({
  search = "",
  status = "all",
  pageSize = 20,
  cursor = null,
} = {}) {
  await prepareResponse();

  if (mockScenario === "empty") {
    return { items: [], nextCursor: null, total: 0 };
  }

  const filteredUsers = mockUsers.filter((user) =>
    matchesUser(user, search, status),
  );
  const startIndex = cursor ? Number(cursor) : 0;
  const items = filteredUsers.slice(startIndex, startIndex + pageSize);
  const nextIndex = startIndex + items.length;

  return {
    items: items.map(({ totalSessions, totalRecordings, ...user }) => user),
    nextCursor: nextIndex < filteredUsers.length ? String(nextIndex) : null,
    total: filteredUsers.length,
  };
}

export async function getUserDetails(userId) {
  await prepareResponse();

  if (mockScenario === "empty") {
    throw createScenarioError("not-found", "User not found.");
  }

  const user = mockUsers.find((item) => item.userId === userId);
  if (!user) {
    throw createScenarioError("not-found", "User not found.");
  }

  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    accountStatus: user.accountStatus,
    createdAt: user.createdAt,
    totalSessions: user.totalSessions,
    totalRecordings: user.totalRecordings,
    recentActivity: mockEvents.filter((event) => event.userId === userId),
  };
}

export async function getActivityLogs({
  type = "all",
  userId,
  pageSize = 20,
  cursor = null,
} = {}) {
  await prepareResponse();

  if (mockScenario === "empty") {
    return { events: [], nextCursor: null };
  }

  const filteredEvents = mockEvents.filter((event) => {
    const matchesUser = !userId || event.userId === userId;
    const normalizedType = type.toLowerCase();
    const typePrefixes = {
      sessions: "session_",
      recordings: "recording_",
      analysis: "analysis_",
    };
    const matchesType =
      normalizedType === "all" ||
      (normalizedType === "errors"
        ? event.status === "failed"
        : Boolean(typePrefixes[normalizedType]) &&
          event.type.startsWith(typePrefixes[normalizedType]));

    return matchesUser && matchesType;
  });
  const startIndex = cursor ? Number(cursor) : 0;
  const events = filteredEvents.slice(startIndex, startIndex + pageSize);
  const nextIndex = startIndex + events.length;

  return {
    events,
    nextCursor: nextIndex < filteredEvents.length ? String(nextIndex) : null,
  };
}

export async function setUserDisabled(userId, disabled) {
  await prepareResponse();

  if (mockScenario === "empty") {
    throw createScenarioError("not-found", "User not found.");
  }

  const user = mockUsers.find((item) => item.userId === userId);
  if (!user) {
    throw createScenarioError("not-found", "User not found.");
  }

  user.accountStatus = disabled ? "suspended" : "active";

  return {
    userId: user.userId,
    accountStatus: user.accountStatus,
    updatedAt: new Date().toISOString(),
  };
}
