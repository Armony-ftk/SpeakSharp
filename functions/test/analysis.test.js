const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { feedbackSchema, parseFeedback, calculateOverallRating, hasSavedFeedback,
  buildAnalysisInput, responseJsonSchema, SYSTEM_INSTRUCTION } = require("../aiFeedback");
const { createAnalysisProcessor, createAnalysisRetry, shouldAnalyse, STALE_ANALYSIS_MS } = require("../analysisProcessor");
const { generateFeedback, analyseRecording, retryRecordingAnalysis, MODEL } = require("../analysis");

const sessionPath = "users/owner/sessions/session";
const recordingPath = `${sessionPath}/recordings/attempt`;
const transcript = { originalText: "Today I will explain how regular practice helps us communicate clearly. We improve by listening to feedback and trying again. Please practise one short presentation this week.", words: [{ word: "today", start: 0, end: 1 }] };
const metrics = { wordCount: 28, wordsPerMinute: 84, fillerCount: 0, fillerWords: {}, targetDurationStatus: null, customMetric: "keep" };
const response = {
  criteriaScores: Object.fromEntries(["clarity", "logicalStructure", "contentRelevance", "conciseness", "audienceOrientation"]
    .map((name, index) => [name, { score: 6 + index, feedback: `Specific feedback about ${name}.` }])),
  structureFeedback: {
    introduction: { score: 8, feedback: "The opening states the topic and purpose." },
    body: { score: 7, feedback: "Explain a concrete example of applying feedback." },
    conclusion: { score: 8, feedback: "The final sentence offers an action." },
  },
  strengths: ["Clear topic.", "A practical action.", "Concise explanations."],
  improvements: ["Add a concrete example.", "Connect practice to the audience's needs.", "Explain how to evaluate progress."],
  audienceQuestions: ["How often should we practise?", "Who should provide feedback?", "How do we measure improvement?"],
  overallSummary: "The message is clear; add an example to develop the advice.",
};

function fixture(overrides = {}) {
  const documents = new Map([
    [sessionPath, { title: "Effective practice", context: "University presentations", targetDurationSeconds: null,
      ratingSum: 0, bestRating: null, latestRating: null, attemptCount: 2, status: "active" }],
    [recordingPath, { userId: "owner", sessionId: "session", processingStatus: "transcript_ready",
      transcript: structuredClone(transcript), metrics: structuredClone(metrics), durationSeconds: 20,
      createdAt: 100, audioPath: "recordings/owner/session/attempt.m4a", personalNote: "Keep", ...overrides }],
  ]);
  const state = { calls: 0, writes: [], logs: [] };
  const snapshot = (path) => ({ id: path.split("/").at(-1), exists: documents.has(path), data: () => documents.get(path) });
  const reference = (path) => ({ path, collection: (name) => ({
    doc: (id) => reference(`${path}/${name}/${id}`),
    orderBy: () => ({ queryPath: `${path}/${name}` }),
  }) });
  let queue = Promise.resolve();
  function resolve(value) {
    if (value?.isEqual?.(FieldValue.serverTimestamp())) return Timestamp.now();
    if (value instanceof Timestamp) return value;
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, resolve(v)]));
    return value;
  }
  const db = { doc: reference, runTransaction(callback) {
    const next = queue.then(async () => {
      const writes = [];
      const result = await callback({
        get: async (ref) => ref.queryPath ? { docs: [...documents.keys()]
          .filter((path) => path.startsWith(`${ref.queryPath}/`))
          .sort((a, b) => documents.get(b).createdAt - documents.get(a).createdAt)
          .map(snapshot) } : snapshot(ref.path),
        update: (ref, updates) => writes.push([ref.path, updates]),
      });
      if (state.failAllWrites || (state.failSuccessWrite && writes.some(([, update]) => update.processingStatus === "completed"))) {
        throw new Error("Private database detail");
      }
      for (const [path, updates] of writes) {
        assert.ok(documents.has(path));
        const data = documents.get(path);
        for (const [key, value] of Object.entries(updates)) {
          const parts = key.split(".");
          let target = data;
          for (const part of parts.slice(0, -1)) target = target[part] ??= {};
          if (value?.isEqual?.(FieldValue.delete())) delete target[parts.at(-1)];
          else target[parts.at(-1)] = resolve(value);
        }
        state.writes.push({ path, updates });
      }
      return result;
    });
    queue = next.catch(() => {});
    return next;
  } };
  const logger = Object.fromEntries(["info", "warn", "error"].map((level) => [level, (...args) => state.logs.push(args)]));
  const dependencies = { db, logger, generate: async (input) => {
    state.calls++;
    state.input = input;
    assert.equal(documents.get(recordingPath).processingStatus, "analysing");
    if (state.duringGeneration) await state.duringGeneration();
    if (state.error) throw state.error;
    return state.response ?? { text: JSON.stringify(response) };
  } };
  const makeEvent = (before = { processingStatus: "transcript_ready" }) => ({
    params: { userId: "owner", sessionId: "session", recordingId: "attempt" },
    data: { before: { data: () => before }, after: { data: () => structuredClone(documents.get(recordingPath)) } },
  });
  const initialAfter = structuredClone(documents.get(recordingPath));
  const event = makeEvent();
  event.data.after.data = () => initialAfter;
  return { documents, state, dependencies, event, makeEvent, data: () => documents.get(recordingPath),
    session: () => documents.get(sessionPath), run: (input = event) => createAnalysisProcessor(dependencies)(input),
    retry: (request = { auth: { uid: "owner" }, data: { sessionId: "session", recordingId: "attempt" } }) => createAnalysisRetry(dependencies)(request) };
}

test("strict schema and rating accept zeros and exclude diagnostic structure scores", () => {
  assert.equal(calculateOverallRating(response), 7.7);
  assert.equal(parseFeedback({ text: JSON.stringify(response) }).overallRating, 7.7);
  const zero = structuredClone(response);
  Object.values(zero.criteriaScores).forEach((item) => { item.score = 0; });
  Object.values(zero.structureFeedback).forEach((item) => { item.score = 10; });
  assert.equal(calculateOverallRating(zero), 0);
  assert.equal(typeof calculateOverallRating(response), "number");
  assert.equal(hasSavedFeedback({ ...response, overallRating: 7.7 }), true);
  assert.equal(hasSavedFeedback({ ...response, overallRating: 8 }), false);
});

test("every required field, nested field, number range and list size is validated without coercion", () => {
  for (const key of Object.keys(response)) {
    const missing = structuredClone(response); delete missing[key];
    assert.equal(feedbackSchema.safeParse(missing).success, false, key);
  }
  for (const section of ["criteriaScores", "structureFeedback"]) {
    for (const key of Object.keys(response[section])) {
      const missing = structuredClone(response); delete missing[section][key];
      assert.equal(feedbackSchema.safeParse(missing).success, false);
      for (const score of [null, "8", NaN, Infinity, -Infinity, -1, 10.1, true, undefined]) {
        const invalid = structuredClone(response); invalid[section][key].score = score;
        assert.equal(feedbackSchema.safeParse(invalid).success, false);
      }
      for (const feedback of ["", "  ", null, 1, undefined]) {
        const invalid = structuredClone(response); invalid[section][key].feedback = feedback;
        assert.equal(feedbackSchema.safeParse(invalid).success, false);
      }
    }
  }
  for (const section of ["strengths", "improvements", "audienceQuestions"]) {
    for (const value of [[], ["one", "two"], ["one", "two", " "], ["one", "two", null], Array(6).fill("item")]) {
      assert.equal(feedbackSchema.safeParse({ ...response, [section]: value }).success, false);
    }
  }
  for (const key of ["strengths", "improvements"]) {
    assert.equal(feedbackSchema.safeParse({ ...response, [key]: Array(4).fill("item") }).success, false);
  }
  for (const length of [3, 4, 5]) {
    assert.equal(feedbackSchema.safeParse({ ...response, audienceQuestions: Array(length).fill("Question?") }).success, true);
  }
  for (const overallSummary of ["", "  ", null, 0]) assert.equal(feedbackSchema.safeParse({ ...response, overallSummary }).success, false);
  for (const mutate of [
    (r) => { r.overallRating = 10; }, (r) => { r.unexpected = true; },
    (r) => { r.criteriaScores.extra = {}; }, (r) => { r.criteriaScores.clarity.extra = 1; },
    (r) => { r.structureFeedback.extra = {}; }, (r) => { r.structureFeedback.body.extra = 1; },
  ]) {
    const invalid = structuredClone(response); mutate(invalid);
    assert.equal(feedbackSchema.safeParse(invalid).success, false);
  }
});

test("empty, fenced, malformed and unrelated JSON are rejected", () => {
  for (const text of [undefined, null, "", "  ", "{", "```json\n{}\n```", "null", "[]", "{}", "123"]) {
    assert.throws(() => parseFeedback({ text }), (error) => error.processingCode.startsWith("analysis_"));
  }
});

test("success atomically saves feedback and aggregates, preserving the first stages and attemptCount", async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.state.calls, 1);
  assert.equal(f.data().processingStatus, "completed");
  assert.deepEqual(f.data().aiFeedback, { ...response, overallRating: 7.7 });
  assert.deepEqual(f.data().transcript, transcript);
  assert.deepEqual(f.data().metrics, metrics);
  assert.equal(f.data().personalNote, "Keep");
  assert.equal(f.data().durationSeconds, 20);
  assert.equal(f.data().createdAt, 100);
  assert.ok(f.data().analysedAt instanceof Timestamp);
  assert.equal(f.session().ratingSum, 7.7);
  assert.equal(f.session().latestRating, 7.7);
  assert.equal(f.session().bestRating, 7.7);
  assert.equal(f.session().attemptCount, 2);
  assert.equal(f.state.writes.length, 3);
  assert.deepEqual(Object.keys(f.state.input).sort(), ["context", "durationSeconds", "metrics", "title", "transcript"]);
  assert.deepEqual(f.state.input.transcript, { originalText: transcript.originalText });
  assert.equal(f.state.input.metrics.customMetric, undefined);
});

test("repeated concurrent events, completion events and reopening do not double-generate or double-count", async () => {
  const f = fixture();
  await Promise.all([f.run(), f.run(), f.run()]);
  await f.run();
  await f.run(f.makeEvent({ processingStatus: "analysing" }));
  await f.retry();
  assert.equal(f.state.calls, 1);
  assert.equal(f.session().ratingSum, 7.7);
  assert.equal(f.data().processingStatus, "completed");
});

test("valid saved feedback prevents generation even with a transcript_ready status", async () => {
  const f = fixture({ aiFeedback: { ...response, overallRating: 7.7 } });
  await f.run(); assert.equal(f.state.calls, 0);
});

test("metrics persistence triggers analysis; timestamps and analysis writes do not loop", () => {
  assert.equal(shouldAnalyse({ processingStatus: "transcript_ready" }, { processingStatus: "transcript_ready", metrics }), true);
  assert.equal(shouldAnalyse({ processingStatus: "transcript_ready", metrics }, { processingStatus: "transcript_ready", metrics, updatedAt: 1 }), false);
  for (const processingStatus of ["pending_upload", "transcribing", "analysing", "completed", "failed"]) {
    assert.equal(shouldAnalyse({}, { processingStatus, metrics }), false);
  }
});

test("missing metrics wait; absent, unusable transcript and malformed input fail without a generation", async () => {
  const pending = fixture({ metrics: undefined }); await pending.run();
  assert.equal(pending.state.calls, 0);
  assert.equal(pending.data().processingStatus, "transcript_ready");
  for (const change of [
    { transcript: undefined }, { transcript: { originalText: " " } },
    { transcript: { originalText: "Hello there." } }, { transcript: { originalText: "hello ".repeat(30) } },
    { transcript: { originalText: "Too long a transcript. ".repeat(3000) } },
    { durationSeconds: 0 }, { metrics: {} }, { metrics: { ...metrics, wordsPerMinute: null } },
    { metrics: { ...metrics, fillerCount: 1 } },
  ]) {
    const f = fixture(change); await f.run();
    assert.equal(f.state.calls, 0);
    assert.equal(f.data().processingStatus, "failed");
    assert.equal(f.data().processingError.stage, "analysis");
    assert.equal(f.data().aiFeedback, undefined);
  }
});

test("zero metrics are available data and optional session values are sent only when present", async () => {
  const f = fixture({ metrics: { wordCount: 0, wordsPerMinute: 0, fillerCount: 0, fillerWords: {}, targetDurationStatus: null } });
  await f.run(); assert.equal(f.state.calls, 1);
  const input = buildAnalysisInput(f.data(), { title: "Speech", context: null, targetDurationSeconds: 60 });
  assert.equal(input.context, undefined);
  assert.equal(input.targetDurationSeconds, 60);
});

test("invalid responses fail without partial feedback, aggregate writes or lost transcript/metrics", async () => {
  for (const text of ["{bad", "{}", "", JSON.stringify({ ...response, overallRating: 10 })]) {
    const f = fixture(); f.state.response = { text }; await f.run(); await f.run();
    assert.equal(f.state.calls, 1);
    assert.equal(f.data().processingStatus, "failed");
    assert.equal(f.data().aiFeedback, undefined);
    assert.deepEqual(f.data().transcript, transcript); assert.deepEqual(f.data().metrics, metrics);
    assert.equal(f.session().ratingSum, 0);
  }
});

test("auth, quota, unavailable model, network and timeout errors are sanitized and never auto-retried", async () => {
  for (const [error, code] of [
    [{ status: 401 }, "analysis_auth"], [{ status: 403 }, "analysis_auth"],
    [{ status: 429 }, "analysis_quota"], [{ status: 404 }, "analysis_model_unavailable"],
    [{ name: "TimeoutError" }, "analysis_timeout"], [{ status: 504 }, "analysis_timeout"],
    [{ code: "ECONNRESET" }, "analysis_unavailable"],
  ]) {
    const f = fixture(); f.state.error = Object.assign(new Error("PRIVATE transcript and key"), error);
    await f.run(); await f.run();
    assert.equal(f.state.calls, 1);
    assert.deepEqual(f.data().processingError, { stage: "analysis", code });
    assert.deepEqual(f.data().metrics, metrics); assert.deepEqual(f.data().transcript, transcript);
    assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
    if (error.status === 429) await assert.rejects(f.retry(), (e) => e.code === "resource-exhausted");
  }
});

test("SDK diagnostics expose only safe HTTP/category/reason fields for automatic analysis and retry", async () => {
  const f = fixture();
  let requests = 0;
  f.dependencies.generate = (input) => generateFeedback(input, "PRIVATE_API_KEY", { fetch: async () => {
    requests++;
    return new Response(JSON.stringify({ error: {
      code: 400, status: "INVALID_ARGUMENT", message: "PRIVATE provider message containing prompt and transcript",
      details: [
        { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "API_KEY_INVALID",
          metadata: { apiKey: "PRIVATE_API_KEY", consumer: "PRIVATE_PROJECT" } },
        { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ description: "PRIVATE_TRANSCRIPT" }] },
      ],
    } }), { status: 400, headers: { "Content-Type": "application/json" } });
  } });
  await f.run();
  await f.retry();
  await f.run(f.makeEvent({ processingStatus: "failed" }));
  assert.equal(requests, 2);
  const logs = f.state.logs.filter(([message]) => message === "Recording analysis failed");
  assert.equal(logs.length, 2);
  for (const [attempt, [, fields]] of logs.entries()) {
    assert.deepEqual(fields, {
      recordingId: "attempt", stage: "generation", code: "analysis_unavailable", attempt,
      errorName: "ApiError", errorClass: "ApiError", httpStatus: 400,
      providerCategory: "INVALID_ARGUMENT", providerReason: "API_KEY_INVALID", networkCode: null,
    });
  }
  assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
  assert.deepEqual(f.data().processingError, { stage: "analysis", code: "analysis_unavailable" });
  assert.deepEqual(f.data().transcript, transcript);
  assert.deepEqual(f.data().metrics, metrics);
});

test("network diagnostics retain safe cause codes without messages, stacks or arbitrary fields", async () => {
  const f = fixture();
  f.state.error = new TypeError("PRIVATE fetch failure", {
    cause: Object.assign(new Error("PRIVATE connection detail"), { code: "ENOTFOUND", hostname: "PRIVATE_HOST" }),
  });
  await f.run();
  const [, fields] = f.state.logs.find(([message]) => message === "Recording analysis failed");
  assert.equal(fields.errorName, "TypeError");
  assert.equal(fields.errorClass, "TypeError");
  assert.equal(fields.networkCode, "ENOTFOUND");
  assert.equal(fields.httpStatus, null);
  assert.equal(fields.providerCategory, null);
  assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
  assert.deepEqual(f.data().processingError, { stage: "analysis", code: "analysis_unavailable" });
});

test("diagnostics reject unknown labels, malformed JSON and invalid HTTP status values safely", async () => {
  for (const error of [
    Object.assign(new Error("PRIVATE_MESSAGE"), {
      name: "PRIVATE_NAME", constructor: { name: "PRIVATE_CLASS" }, status: "400", code: "PRIVATE_CODE",
      error: { status: "PRIVATE_CATEGORY", details: [
        { "@type": "type.googleapis.com/google.rpc.ErrorInfo", reason: "PRIVATE_REASON" },
      ] },
    }),
    Object.assign(new Error("{PRIVATE_INVALID_JSON"), { name: "ApiError", status: NaN }),
    Object.assign(new Error(JSON.stringify({ error: { status: "PRIVATE_CATEGORY", details: "PRIVATE_DETAILS" } })),
      { name: "ApiError", status: Infinity }),
    Object.assign(new Error("PRIVATE ".repeat(10000)), { name: "ApiError", status: 999 }),
  ]) {
    const f = fixture(); f.state.error = error; await f.run();
    const [, fields] = f.state.logs.find(([message]) => message === "Recording analysis failed");
    assert.equal(fields.httpStatus, null);
    assert.equal(fields.providerCategory, null);
    assert.equal(fields.providerReason, null);
    assert.equal(fields.networkCode, null);
    assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
    assert.equal(f.data().processingStatus, "failed");
  }
});

test("diagnostic stages distinguish input validation, generation and response validation without changing stored errors", async () => {
  for (const [setup, expectedStage, expectedCode] of [
    [(f) => { f.data().transcript = null; }, "validation", "analysis_no_transcript"],
    [(f) => { f.state.response = { text: "PRIVATE_INVALID_JSON" }; }, "response_validation", "analysis_invalid_json"],
    [(f) => { f.state.response = { text: "{}" }; }, "response_validation", "analysis_invalid_response"],
    [(f) => { f.state.failSuccessWrite = true; }, "saving", "analysis_database_unavailable"],
  ]) {
    const f = fixture(); setup(f); await f.run();
    const [, fields] = f.state.logs.find(([message]) => message === "Recording analysis failed");
    assert.equal(fields.stage, expectedStage);
    assert.deepEqual(f.data().processingError, { stage: "analysis", code: expectedCode });
    assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
  }
});

test("an older attempt finishing later contributes once without overwriting latestRating or attemptCount", async () => {
  const f = fixture({ attemptNumber: 1 });
  f.documents.set(`${sessionPath}/recordings/newer`, { createdAt: 200, attemptNumber: 2, processingStatus: "completed", aiFeedback: { overallRating: 9 } });
  Object.assign(f.session(), { latestRating: 9, bestRating: 9, ratingSum: 9 });
  await f.run(); await f.run();
  assert.equal(f.session().latestRating, 9);
  assert.equal(f.session().bestRating, 9);
  assert.equal(f.session().ratingSum, 16.7);
  assert.equal(f.session().attemptCount, 2);
});

test("completion after deletion selects the newest rated attempt even when a newer upload is pending", async () => {
  const f = fixture();
  f.documents.set(`${sessionPath}/recordings/pending`, { createdAt: 300, processingStatus: "pending_upload" });
  f.documents.set(`${sessionPath}/recordings/older`, { createdAt: 50, processingStatus: "completed", aiFeedback: { overallRating: 4 } });
  Object.assign(f.session(), { ratingSum: 4, bestRating: 4, latestRating: 4 });
  await f.run();
  assert.equal(f.session().latestRating, 7.7); assert.equal(f.session().bestRating, 7.7); assert.equal(f.session().ratingSum, 11.7);
});

test("persistence failure cannot partially update aggregates or mark completion", async () => {
  const f = fixture(); f.state.failSuccessWrite = true;
  await f.run();
  assert.equal(f.data().processingStatus, "failed");
  assert.equal(f.data().aiFeedback, undefined);
  assert.equal(f.data().processingError.code, "analysis_database_unavailable");
  assert.equal(f.session().ratingSum, 0);
  assert.deepEqual(f.data().transcript, transcript); assert.deepEqual(f.data().metrics, metrics);
});

test("malformed existing rating aggregates fail without partial completion", async () => {
  const f = fixture(); f.session().ratingSum = "invalid";
  await f.run();
  assert.equal(f.data().processingStatus, "failed");
  assert.equal(f.data().aiFeedback, undefined);
  assert.equal(f.session().ratingSum, "invalid");
});

test("failed claims make no request; a total database outage after generation never causes another request", async () => {
  const before = fixture(); before.state.failAllWrites = true;
  await before.run(); assert.equal(before.state.calls, 0);
  const after = fixture(); after.state.duringGeneration = () => { after.state.failAllWrites = true; };
  await after.run(); await after.run();
  assert.equal(after.state.calls, 1); assert.equal(after.data().processingStatus, "analysing");
  assert.equal(after.session().ratingSum, 0);
  assert.ok(JSON.stringify(after.state.logs).includes("Could not persist analysis failure"));
});

test("deleting or deleted sessions and mismatched ownership never receive feedback", async () => {
  for (const mutation of [
    (f) => { f.session().deleting = true; }, (f) => { f.documents.delete(sessionPath); },
    (f) => { f.documents.delete(recordingPath); }, (f) => { f.data().userId = "other"; },
  ]) {
    const f = fixture(); mutation(f); await f.run(); assert.equal(f.state.calls, 0);
  }
  for (const deleted of [false, true]) {
    const f = fixture();
    f.state.duringGeneration = () => {
      if (deleted) { f.documents.delete(sessionPath); f.documents.delete(recordingPath); }
      else f.session().deleting = true;
    };
    await f.run();
    assert.equal(f.data()?.aiFeedback, undefined);
    assert.equal(f.documents.has(sessionPath), !deleted);
  }
});

test("explicit retry reuses earlier results and fences out delayed pre-retry events", async () => {
  const f = fixture(); f.state.response = { text: "{}" };
  await f.run();
  await Promise.allSettled([f.retry(), f.retry()]);
  assert.equal(f.data().analysisJob.attempt, 1);
  assert.equal(f.data().processingStatus, "transcript_ready");
  await f.run(); assert.equal(f.state.calls, 1);
  delete f.state.response;
  await f.run(f.makeEvent({ processingStatus: "failed" }));
  assert.equal(f.state.calls, 2);
  assert.equal(f.data().processingStatus, "completed");
  assert.equal(f.session().ratingSum, 7.7);
  assert.deepEqual(f.data().transcript, transcript); assert.deepEqual(f.data().metrics, metrics);
});

test("retry requires authentication, path ownership, correct stage and usable inputs", async () => {
  const f = fixture({ processingStatus: "failed", processingError: { stage: "analysis" } });
  for (const [request, code] of [
    [{ data: {} }, "unauthenticated"],
    [{ auth: { uid: "other" }, data: { sessionId: "session", recordingId: "attempt" } }, "not-found"],
    [{ auth: { uid: "owner" }, data: { sessionId: "../session", recordingId: "attempt" } }, "invalid-argument"],
  ]) await assert.rejects(f.retry(request), (e) => e.code === code);
  for (const processingStatus of ["pending_upload", "transcribing", "transcript_ready", "analysing"]) {
    f.data().processingStatus = processingStatus;
    await assert.rejects(f.retry(), (e) => e.code === "failed-precondition");
  }
  f.data().processingStatus = "failed";
  f.data().processingError.stage = "metrics";
  await assert.rejects(f.retry(), (e) => e.code === "failed-precondition");
  f.data().processingError.stage = "analysis";
  f.data().transcript = null;
  await assert.rejects(f.retry(), (e) => e.code === "failed-precondition");
});

test("only expired analysis claims can be explicitly recovered and late workers cannot complete them", async () => {
  const f = fixture();
  f.state.duringGeneration = async () => {
    await assert.rejects(f.retry(), (e) => e.code === "failed-precondition");
    f.data().analysisJob.startedAt = Timestamp.fromMillis(Date.now() - STALE_ANALYSIS_MS - 1000);
    await f.retry();
  };
  await f.run();
  assert.equal(f.data().processingStatus, "transcript_ready");
  assert.equal(f.data().aiFeedback, undefined);
  assert.equal(f.session().ratingSum, 0);
  delete f.state.duringGeneration;
  await f.run(f.makeEvent({ processingStatus: "analysing" }));
  assert.equal(f.data().processingStatus, "completed");
  assert.equal(f.session().ratingSum, 7.7);
});

test("an explicitly retried stale metrics handoff runs without changing or recalculating metrics", async () => {
  const f = fixture({ updatedAt: Timestamp.fromMillis(Date.now() - STALE_ANALYSIS_MS - 1000) });
  const before = { ...f.data() };
  await f.retry();
  assert.equal(f.data().analysisJob.attempt, 1);
  const retryEvent = f.makeEvent(before);
  assert.equal(shouldAnalyse(before, retryEvent.data.after.data()), true);
  await f.run(retryEvent);
  assert.equal(f.state.calls, 1);
  assert.equal(f.data().processingStatus, "completed");
  assert.deepEqual(f.data().metrics, metrics);
});

test("installed Gemini SDK sends one structured generation with separated rubric and minimal data", async () => {
  let calls = 0;
  const input = buildAnalysisInput(fixture().data(), { title: "Practice" });
  const result = await generateFeedback(input, "test-only-key", { fetch: async (url, init) => {
    calls++;
    assert.match(String(url), new RegExp(`/models/${MODEL}:generateContent$`));
    assert.equal(init.method, "POST");
    const body = JSON.parse(init.body);
    assert.deepEqual(JSON.parse(body.contents[0].parts[0].text), input);
    assert.equal(body.systemInstruction.parts[0].text, SYSTEM_INSTRUCTION);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(body.generationConfig.responseJsonSchema, responseJsonSchema);
    assert.equal(body.generationConfig.maxOutputTokens, 6000);
    assert.equal(body.generationConfig.candidateCount, 1);
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, "LOW");
    assert.equal(body.generationConfig.responseJsonSchema.additionalProperties, false);
    assert.equal(body.generationConfig.responseJsonSchema.properties.overallRating, undefined);
    assert.ok(init.signal);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(response) }] }, finishReason: "STOP" }] }),
      { status: 200, headers: { "Content-Type": "application/json" } });
  } });
  assert.equal(calls, 1);
  assert.equal(parseFeedback(result).overallRating, 7.7);
});

test("SDK transport never retries quota or server failures and does not fall back to another model", async () => {
  for (const status of [401, 403, 404, 429, 500, 503]) {
    let calls = 0;
    await assert.rejects(generateFeedback({}, "test-only-key", { fetch: async () => {
      calls++;
      return new Response(JSON.stringify({ error: { code: status, status: status === 429 ? "RESOURCE_EXHAUSTED" : "UNAVAILABLE", message: "Test error" } }),
        { status, headers: { "Content-Type": "application/json" } });
    } }), (error) => error.status === status);
    assert.equal(calls, 1);
  }
  await assert.rejects(generateFeedback({}, ""), (error) => error.processingCode === "analysis_auth");
});

test("only the analysis trigger binds the existing secret; both new functions use us-central1", () => {
  assert.deepEqual(analyseRecording.__endpoint.region, ["us-central1"]);
  assert.deepEqual(analyseRecording.__endpoint.secretEnvironmentVariables, [{ key: "GEMINI_API_KEY" }]);
  assert.equal(analyseRecording.__endpoint.eventTrigger.retry, false);
  assert.deepEqual(retryRecordingAnalysis.__endpoint.region, ["us-central1"]);
  assert.ok(!retryRecordingAnalysis.__endpoint.secretEnvironmentVariables?.length);
});

test("recording deletion fences analysis claims, successful/failed responses and manual retries", async () => {
  const marked = fixture({ deleting: true });
  await marked.run(); assert.equal(marked.state.calls, 0);
  await assert.rejects(marked.retry(), { code: "not-found" });
  for (const removed of [false, true]) {
    for (const fails of [false, true]) {
      const f = fixture();
      f.state.duringGeneration = () => {
        if (removed) f.documents.delete(recordingPath);
        else f.data().deleting = true;
        if (fails) throw new Error("provider failed after deletion");
      };
      await f.run();
      assert.equal(f.data()?.aiFeedback, undefined);
      assert.equal(f.session().ratingSum, 0);
      assert.equal(f.documents.has(recordingPath), !removed);
      if (!removed) assert.equal(f.data().processingStatus, "analysing");
    }
  }
});
