const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const {
  FieldValue,
  Timestamp,
  getFirestore,
} = require("firebase-admin/firestore");

const { requireAdmin } = require("./adminAuthorization");

const ACTIVITY_COLLECTION = "adminActivityLogs";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_USER_ID_LENGTH = 128;

const ACTIVITY_FILTERS = {
  all: {},

  sessions: {
    typeValues: ["session_created"],
  },

  recordings: {
    typeValues: ["recording_saved"],
  },

  analysis: {
    typeValues: ["analysis_completed", "processing_failed"],
  },

  errors: {
    status: "failed",
  },

  Admin: {
    typeValues: ["Admin"],
  },
};

/**
 * Encodes a cursor without losing Firestore timestamp precision.
 */
function encodeCursor({ seconds, nanoseconds, id }) {
  return Buffer.from(
    JSON.stringify({ seconds, nanoseconds, id }),
    "utf8",
  ).toString("base64url");
}

/**
 * Decodes and validates a pagination cursor.
 */
function decodeCursor(cursor) {
  if (cursor == null || cursor === "") {
    return null;
  }

  if (typeof cursor !== "string" || cursor.length > 512) {
    throw new HttpsError("invalid-argument", "The cursor is invalid.");
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    );

    if (
      !decoded ||
      !Number.isSafeInteger(decoded.seconds) ||
      decoded.seconds < 0 ||
      !Number.isInteger(decoded.nanoseconds) ||
      decoded.nanoseconds < 0 ||
      decoded.nanoseconds > 999999999 ||
      typeof decoded.id !== "string" ||
      !decoded.id
    ) {
      throw new Error("Invalid cursor payload.");
    }

    return decoded;
  } catch {
    throw new HttpsError("invalid-argument", "The cursor is invalid.");
  }
}

/**
 * Validates the frontend query and converts it into a safe query object.
 */
function normalizeQuery(data) {
  const query = data == null ? {} : data;

  if (typeof query !== "object" || Array.isArray(query)) {
    throw new HttpsError(
      "invalid-argument",
      "The activity query is invalid.",
    );
  }

  const rawType = query.type == null ? "all" : query.type;

  const type =
    typeof rawType === "string" &&
    rawType.toLowerCase() === "admin"
      ? "Admin"
      : rawType;

  const userId = query.userId == null ? null : query.userId;

  const pageSize =
    query.pageSize == null ? DEFAULT_PAGE_SIZE : query.pageSize;

  // Only explicitly defined filters are accepted.
  if (
    typeof type !== "string" ||
    !Object.prototype.hasOwnProperty.call(ACTIVITY_FILTERS, type)
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The activity type is invalid.",
    );
  }

  if (
    userId !== null &&
    (
      typeof userId !== "string" ||
      !userId.trim() ||
      userId.length > MAX_USER_ID_LENGTH ||
      userId.includes("/")
    )
  ) {
    throw new HttpsError(
      "invalid-argument",
      "The user ID is invalid.",
    );
  }

  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new HttpsError(
      "invalid-argument",
      `pageSize must be between 1 and ${MAX_PAGE_SIZE}.`,
    );
  }

  return {
    type,
    userId: userId?.trim() || null,
    pageSize,
    cursor: decodeCursor(query.cursor),
    ...ACTIVITY_FILTERS[type],
  };
}

/**
 * Converts stored date/timestamp values into Firestore Timestamp instances.
 */
function toTimestamp(value) {
  if (value instanceof Timestamp) {
    return value;
  }

  if (
    value &&
    Number.isSafeInteger(value.seconds) &&
    Number.isInteger(value.nanoseconds)
  ) {
    return new Timestamp(value.seconds, value.nanoseconds);
  }

  if (value && typeof value.toDate === "function") {
    return Timestamp.fromDate(value.toDate());
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Activity timestamp is invalid.");
  }

  return Timestamp.fromDate(date);
}

/**
 * Returns only the fields that the admin activity screen needs.
 * Private recording and analysis data is never included.
 */
function serializeEvent(snapshot) {
  const data = snapshot.data() || {};
  const occurredAt = toTimestamp(data.occurredAt);

  const event = {
    id: snapshot.id,
    userId: typeof data.userId === "string" ? data.userId : null,
    userName:
      typeof data.userName === "string" ? data.userName : null,
    type: typeof data.type === "string" ? data.type : null,
    label: typeof data.label === "string" ? data.label : null,
    occurredAt: occurredAt.toDate().toISOString(),
    status: typeof data.status === "string" ? data.status : null,
  };

  if (
    data.type === "Admin" &&
    (data.action === "suspend" || data.action === "reactivate")
  ) {
    event.action = data.action;
  }

  return event;
}

/**
 * Creates the Firestore reader.
 * Injection of getDb lets the query provider be tested without production data.
 */
function createFirestoreActivityPageProvider({
  getDb = getFirestore,
} = {}) {
  if (typeof getDb !== "function") {
    throw new TypeError("getDb must be a function.");
  }

  return async function readActivityPage(query) {
    const db = getDb();

    let firestoreQuery = db.collection(ACTIVITY_COLLECTION);

    if (query.userId) {
      firestoreQuery = firestoreQuery.where(
        "userId",
        "==",
        query.userId,
      );
    }

    if (query.status) {
      firestoreQuery = firestoreQuery.where(
        "status",
        "==",
        query.status,
      );
    }

    if (query.typeValues?.length === 1) {
      firestoreQuery = firestoreQuery.where(
        "type",
        "==",
        query.typeValues[0],
      );
    } else if (query.typeValues?.length > 1) {
      firestoreQuery = firestoreQuery.where(
        "type",
        "in",
        query.typeValues,
      );
    }

    // Order by timestamp, then ID, so events with equal timestamps
    // still have a stable order.
    firestoreQuery = firestoreQuery
      .orderBy("occurredAt", "desc")
      .orderBy("id", "desc");

    if (query.cursor) {
      firestoreQuery = firestoreQuery.startAfter(
        new Timestamp(
          query.cursor.seconds,
          query.cursor.nanoseconds,
        ),
        query.cursor.id,
      );
    }

    // Fetch one extra record to determine whether another page exists.
    const snapshot = await firestoreQuery
      .limit(query.pageSize + 1)
      .get();

    const pageDocuments = snapshot.docs.slice(0, query.pageSize);
    const events = pageDocuments.map(serializeEvent);

    const lastDocument =
      pageDocuments[pageDocuments.length - 1];

    const hasMore = snapshot.docs.length > query.pageSize;

    let nextCursor = null;

    if (hasMore && lastDocument) {
      const lastTimestamp = toTimestamp(
        lastDocument.data()?.occurredAt,
      );

      nextCursor = encodeCursor({
        seconds: lastTimestamp.seconds,
        nanoseconds: lastTimestamp.nanoseconds,
        id: lastDocument.id,
      });
    }

    return {
      events,
      nextCursor,
    };
  };
}

/**
 * Authorizes the caller before validating or reading activity data.
 */
function createGetActivityLogs({
  requireAdmin: requireAdminDependency,
  readActivityPage,
} = {}) {
  if (typeof requireAdminDependency !== "function") {
    throw new TypeError("requireAdmin must be a function.");
  }

  if (typeof readActivityPage !== "function") {
    throw new TypeError("readActivityPage must be a function.");
  }

  return async function getActivityLogs(request) {
    await requireAdminDependency(request);

    const query = normalizeQuery(request?.data);

    return readActivityPage(query);
  };
}

/**
 * Hides internal errors from the frontend while retaining safe error codes.
 */
function createCallableGetActivityLogs({
  requireAdmin: requireAdminDependency,
  readActivityPage,
} = {}) {
  const handler = createGetActivityLogs({
    requireAdmin: requireAdminDependency,
    readActivityPage,
  });

  return async function callableGetActivityLogs(request) {
    try {
      return await handler(request);
    } catch (error) {
      const safeCodes = new Set([
        "invalid-argument",
        "unauthenticated",
        "permission-denied",
      ]);

      if (error instanceof HttpsError && safeCodes.has(error.code)) {
        throw error;
      }

      console.error("getActivityLogs failed", error);

      throw new HttpsError(
        "internal",
        "Unable to load administrator activity.",
      );
    }
  };
}

/**
 * Creates a trusted activity event when a session document is created.
 * The deterministic document ID makes repeated trigger delivery idempotent.
 */
function createSessionCreatedHandler({
  getDb = getFirestore,
  getOccurredAt = (event) => {
    // Prefer the Firestore document's creation timestamp because it
    // preserves Firestore timestamp precision.
    try {
      return toTimestamp(
        event?.data?.createTime ?? event?.time,
      );
    } catch {
      return FieldValue.serverTimestamp();
    }
  },
} = {}) {
  return async function recordSessionCreated(event) {
    const userId = event?.params?.userId;
    const sessionId = event?.params?.sessionId;

    if (
      typeof userId !== "string" ||
      !userId ||
      typeof sessionId !== "string" ||
      !sessionId
    ) {
      throw new Error("Session trigger parameters are invalid.");
    }

    const db = getDb();

    // Read the profile from users/{userId}; a profile may not exist.
    const profileSnapshot = await db
      .collection("users")
      .doc(userId)
      .get();

    const profile = profileSnapshot.exists
      ? profileSnapshot.data() || {}
      : {};

    const eventId = `session_created_${userId}_${sessionId}`;

    // Store metadata only. Do not copy session content into the log.
    await db
      .collection(ACTIVITY_COLLECTION)
      .doc(eventId)
      .set({
        id: eventId,
        userId,
        userName:
          typeof profile.fullName === "string"
            ? profile.fullName
            : null,
        type: "session_created",
        label: "Created a practice session",
        status: "success",
        occurredAt: getOccurredAt(event),
        source: "trusted_function",
      });
  };
}

const readActivityPage = createFirestoreActivityPageProvider();

const getActivityLogs = onCall(
  {
    region: "us-central1",
    invoker: "public",
  },
  createCallableGetActivityLogs({
    requireAdmin,
    readActivityPage,
  }),
);

const recordSessionCreated = onDocumentCreated(
  {
    region: "us-central1",
    document: "users/{userId}/sessions/{sessionId}",
  },
  createSessionCreatedHandler(),
);

module.exports = {
  createFirestoreActivityPageProvider,
  createGetActivityLogs,
  createCallableGetActivityLogs,
  createSessionCreatedHandler,
  getActivityLogs,
  recordSessionCreated,
};
