const mockApp = {};
const mockFunctions = {};
const mockHttpsCallable = jest.fn();
const mockGetFunctions = jest.fn(() => mockFunctions);

jest.mock("firebase/functions", () => ({
  getFunctions: mockGetFunctions,
  httpsCallable: mockHttpsCallable,
}));

jest.mock("../config/firebase", () => ({
  app: mockApp,
}));

const {
  getActivityLogs,
  getAdminStats,
  getUserDetails,
  getUsers,
  setUserDisabled,
} = require("./adminService");

beforeEach(() => {
  mockHttpsCallable.mockClear();
});

test("uses the correct callable names and request payloads", async () => {
  const callable = jest
    .fn()
    .mockResolvedValueOnce({ data: { totalSessions: 3 } })
    .mockResolvedValueOnce({
      data: { items: [], nextCursor: null, total: 0 },
    })
    .mockResolvedValueOnce({ data: { userId: "user-1" } })
    .mockResolvedValueOnce({ data: { events: [], nextCursor: null } })
    .mockResolvedValueOnce({
      data: {
        userId: "user-1",
        accountStatus: "suspended",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    });

  mockHttpsCallable.mockReturnValue(callable);

  await expect(getAdminStats()).resolves.toEqual({ totalSessions: 3 });
  await expect(
    getUsers({
      search: "amina",
      status: "active",
      pageSize: 10,
      cursor: "cursor-1",
    }),
  ).resolves.toEqual({ items: [], nextCursor: null, total: 0 });
  await expect(getUserDetails("user-1")).resolves.toEqual({
    userId: "user-1",
  });
  await expect(
    getActivityLogs({
      type: "Admin",
      userId: "user-1",
      pageSize: 5,
      cursor: "cursor-2",
    }),
  ).resolves.toEqual({ events: [], nextCursor: null });
  await expect(
    setUserDisabled("user-1", true, "op_123e4567-e89b-42d3-a456-426614174000"),
  ).resolves.toEqual({
    userId: "user-1",
    accountStatus: "suspended",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  expect(mockGetFunctions).toHaveBeenCalledWith(mockApp, "us-central1");
  expect(mockHttpsCallable.mock.calls.map(([, name]) => name)).toEqual([
    "getAdminStats",
    "getUsers",
    "getUserDetails",
    "getActivityLogs",
    "setUserDisabled",
  ]);
  expect(callable.mock.calls).toEqual([
    [{}],
    [
      {
        search: "amina",
        status: "active",
        pageSize: 10,
        cursor: "cursor-1",
      },
    ],
    [{ userId: "user-1" }],
    [
      {
        type: "Admin",
        userId: "user-1",
        pageSize: 5,
        cursor: "cursor-2",
      },
    ],
    [
      {
        userId: "user-1",
        disabled: true,
        operationId: "op_123e4567-e89b-42d3-a456-426614174000",
      },
    ],
  ]);
});

test("supplies the documented defaults for optional requests", async () => {
  const callable = jest.fn().mockResolvedValue({
    data: { events: [], nextCursor: null },
  });
  mockHttpsCallable.mockReturnValue(callable);

  await getUsers();
  await getActivityLogs();

  expect(callable.mock.calls).toEqual([
    [{ search: "", status: "all", pageSize: 20, cursor: null }],
    [{ type: "all", userId: null, pageSize: 20, cursor: null }],
  ]);
});

test.each([
  [getAdminStats, "functions/permission-denied", "permission-denied"],
  [getUsers, "functions/invalid-argument", "invalid-argument"],
  [getUserDetails, "functions/not-found", "not-found"],
  [getActivityLogs, "functions/unavailable", "unavailable"],
  [setUserDisabled, "functions/unauthenticated", "permission-denied"],
  [getAdminStats, "auth/network-request-failed", "unavailable"],
])("normalizes %s from %s to %s", async (adapter, sourceCode, expectedCode) => {
  const callable = jest.fn().mockRejectedValue({
    code: sourceCode,
    message: "backend failure",
    details: { trace: "test-only" },
  });
  mockHttpsCallable.mockReturnValue(callable);

  await expect(
    adapter === getAdminStats
      ? adapter()
      : adapter === getUsers
        ? adapter()
        : adapter === getUserDetails
          ? adapter("user-1")
          : adapter === getActivityLogs
            ? adapter()
            : adapter(
                "user-1",
                true,
                "op_123e4567-e89b-42d3-a456-426614174000",
              ),
  ).rejects.toMatchObject({
    code: expectedCode,
    message: "backend failure",
    details: { trace: "test-only" },
  });
});

test("rethrows unrecognized errors and rejects malformed activity responses", async () => {
  const internalError = new Error("internal failure");
  mockHttpsCallable.mockReturnValueOnce(jest.fn().mockRejectedValue(internalError));
  await expect(getAdminStats()).rejects.toBe(internalError);

  mockHttpsCallable.mockReturnValueOnce(
    jest.fn().mockResolvedValue({ data: { events: [] } }),
  );
  await expect(getActivityLogs()).rejects.toThrow(
    "The activity response has an invalid format.",
  );
});
