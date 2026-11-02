import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../config/firebase";

const activityFunctions = getFunctions(app, "us-central1");
const MOCK_DELAY_MS = 350;
const MOCK_SCENARIOS = ["success", "empty", "error", "offline", "forbidden"];
const MOCK_ADMIN_NAME = "Admin A";

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

  const matchesStatus =
    !status || status === "all" || user.accountStatus === status;

  return matchesSearch && matchesStatus;
}

function createAdminAuditEvent(user, action) {
  const occurredAt = new Date().toISOString();

  return {
    id: `admin_evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    userId: user.userId,
    userName: user.fullName,
    type: "Admin",
    action,
    actorName: MOCK_ADMIN_NAME,
    label: `${MOCK_ADMIN_NAME} ${action} ${user.fullName}`,
    occurredAt,
    status: "success",
  };
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
  try {
    const callable = httpsCallable(activityFunctions, "getAdminStats");
    const result = await callable({});
    return result.data;
  } catch (error) {
    const normalizedCodes = {
      "functions/permission-denied": "permission-denied",
      "functions/unauthenticated": "permission-denied",
      "functions/unavailable": "unavailable",
      "auth/network-request-failed": "unavailable",
    };

    const normalizedCode = normalizedCodes[error?.code];

    if (!normalizedCode) {
      throw error;
    }

    const normalizedError = new Error(
      error.message || "Admin statistics request failed.",
    );

    normalizedError.code = normalizedCode;
    normalizedError.details = error.details;

    throw normalizedError;
  }
}

export async function getUsers({
  search = "",
  status = "all",
  pageSize = 20,
  cursor = null,
} = {}) {
  try {
    const callable = httpsCallable(activityFunctions, "getUsers");

    const result = await callable({
      search,
      status,
      pageSize,
      cursor,
    });

    return result.data;
  } catch (error) {
    const normalizedCodes = {
      "functions/permission-denied": "permission-denied",
      "functions/unauthenticated": "permission-denied",
      "functions/unavailable": "unavailable",
      "auth/network-request-failed": "unavailable",
      "functions/invalid-argument": "invalid-argument",
    };

    const normalizedCode = normalizedCodes[error?.code];

    if (!normalizedCode) {
      throw error;
    }

    const normalizedError = new Error(
      error.message || "User directory request failed.",
    );

    normalizedError.code = normalizedCode;
    normalizedError.details = error.details;

    throw normalizedError;
  }
}

export async function getUserDetails(userId) {
  try {
    const callable = httpsCallable(activityFunctions, "getUserDetails");
    const result = await callable({ userId });

    return result.data;
  } catch (error) {
    const normalizedCodes = {
      "functions/permission-denied": "permission-denied",
      "functions/unauthenticated": "permission-denied",
      "functions/unavailable": "unavailable",
      "functions/not-found": "not-found",
      "functions/invalid-argument": "invalid-argument",
      "auth/network-request-failed": "unavailable",
    };

    const normalizedCode = normalizedCodes[error?.code];

    if (!normalizedCode) {
      throw error;
    }

    const normalizedError = new Error(
      error.message || "User details request failed.",
    );

    normalizedError.code = normalizedCode;
    normalizedError.details = error.details;

    throw normalizedError;
  }
}

export async function getActivityLogs(params = {}) {
  try {
    const getActivityLogsCallable = httpsCallable(
      activityFunctions,
      "getActivityLogs",
    );

    const response = await getActivityLogsCallable({
      type: params.type ?? "all",
      userId: params.userId ?? null,
      pageSize: params.pageSize ?? 20,
      cursor: params.cursor ?? null,
    });

    const data = response.data;

    if (
      !data ||
      !Array.isArray(data.events) ||
      !Object.prototype.hasOwnProperty.call(data, "nextCursor")
    ) {
      throw new Error("The activity response has an invalid format.");
    }

    return data;
  } catch (error) {
    const normalizedCodes = {
      "functions/permission-denied": "permission-denied",
      "functions/unauthenticated": "permission-denied",
      "functions/unavailable": "unavailable",
      "auth/network-request-failed": "unavailable",
    };

    const normalizedCode = normalizedCodes[error?.code];

    if (!normalizedCode) {
      throw error;
    }

    const normalizedError = new Error(
      error.message || "Admin activity request failed.",
    );

    normalizedError.code = normalizedCode;
    normalizedError.details = error.details;

    throw normalizedError;
  }
}

export async function setUserDisabled(userId, disabled, operationId) {
  try {
    const callable = httpsCallable(
      activityFunctions,
      "setUserDisabled",
    );
    const result = await callable({ userId, disabled, operationId });
    return result.data;
  } catch (error) {
    const normalizedCodes = {
      "functions/permission-denied": "permission-denied",
      "functions/unauthenticated": "permission-denied",
      "functions/unavailable": "unavailable",
      "functions/not-found": "not-found",
      "functions/invalid-argument": "invalid-argument",
      "auth/network-request-failed": "unavailable",
    };

    const normalizedCode = normalizedCodes[error?.code];

    if (!normalizedCode) {
      throw error;
    }

    const normalizedError = new Error(
      error.message || "Unable to update account status.",
    );

    normalizedError.code = normalizedCode;
    normalizedError.details = error.details;

    throw normalizedError;
  }
}
