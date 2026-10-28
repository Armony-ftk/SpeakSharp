const { test } = require("node:test");
const assert = require("node:assert/strict");
const { FieldValue } = require("firebase-admin/firestore");
const { createTranscriptionProcessor, extractTranscript, processingError, MAX_AUDIO_BYTES } = require("../transcriptionProcessor");
const { transcribe } = require("../transcription");
const { calculateSpeakingMetrics } = require("../speakingMetrics");

const bucketName = "speaksharp-3893c.firebasestorage.app";
const sessionPath = "users/owner/sessions/session";
const recordingPath = `${sessionPath}/recordings/attempt`;
const audio = Buffer.from("0000ftypM4A ");
const result = {
  metadata: { duration: 12 },
  results: { channels: [{ alternatives: [{
    transcript: "Um, this is my presentation.",
    words: [{ word: "um", start: 0.1, end: 0.4 }],
  }] }] },
};

function fixture(overrides = {}) {
  const documents = new Map([
    [sessionPath, { title: "Presentation", status: "active" }],
    [recordingPath, {
      userId: "owner", sessionId: "session", durationSeconds: 12,
      audioPath: "recordings/owner/session/attempt.m4a",
      processingStatus: "pending_upload", personalNote: "Keep this note", createdAt: "original",
      ...overrides,
    }],
  ]);
  const snapshot = (path) => ({ exists: documents.has(path), data: () => structuredClone(documents.get(path)) });
  const reference = (path) => ({
    path, get: async () => snapshot(path),
    collection: (name) => ({ doc: (id) => reference(`${path}/${name}/${id}`) }),
  });
  const state = { calls: 0, downloads: 0, failSuccessWrite: false, failAllWrites: false, logs: [], writes: [] };
  let queue = Promise.resolve();
  const db = {
    doc: reference,
    runTransaction(callback) {
      const next = queue.then(async () => {
        const writes = [];
        const value = await callback({
          get: async (ref) => snapshot(ref.path),
          update: (ref, updates) => writes.push([ref.path, updates]),
        });
        for (const [path, updates] of writes) {
          if (state.failAllWrites || (state.failSuccessWrite && updates.processingStatus === "transcript_ready")
            || (state.failMetricsWrite && Object.hasOwn(updates, "metrics.wordCount"))) {
            throw new Error("Mock Firestore unavailable");
          }
          assert.ok(documents.has(path), "update cannot recreate a deleted document");
          const data = documents.get(path);
          for (const [key, value] of Object.entries(updates)) {
            if (value?.isEqual?.(FieldValue.delete())) delete data[key];
            else if (value?.isEqual?.(FieldValue.serverTimestamp())) data[key] = "server-time";
            else if (key === "transcriptionJob") data[key] = { generation: value.generation, startedAt: "server-time" };
            else if (key.startsWith("metrics.")) (data.metrics ??= {})[key.slice(8)] = structuredClone(value);
            else data[key] = structuredClone(value);
          }
          state.writes.push({ path, data: structuredClone(data) });
          if (updates.transcript && state.afterTranscriptSaved) state.afterTranscriptSaved();
        }
        return value;
      });
      queue = next.catch(() => {});
      return next;
    },
  };
  const event = { data: { bucket: bucketName, name: documents.get(recordingPath).audioPath,
    generation: "123", size: String(audio.length), contentType: "audio/mp4" } };
  const dependencies = {
    db, bucketName,
    downloadAudio: async () => { state.downloads++; return audio; },
    transcribe: async () => {
      state.calls++;
      assert.equal(documents.get(recordingPath).processingStatus, "transcribing");
      if (state.duringTranscription) await state.duringTranscription();
      if (state.error) throw state.error;
      return state.response ?? result;
    },
    logger: Object.fromEntries(["info", "warn", "error"].map((level) => [level, (...args) => state.logs.push(args)])),
  };
  return { documents, state, event, dependencies, data: () => documents.get(recordingPath),
    run: (input = event) => createTranscriptionProcessor(dependencies)(input) };
}

test("success claims before API call, preserves fields, and saves transcript/status together", async () => {
  const f = fixture();
  await f.run();
  assert.equal(f.data().processingStatus, "transcript_ready");
  assert.equal(f.data().transcript.originalText, result.results.channels[0].alternatives[0].transcript);
  assert.deepEqual(f.data().transcript.words, [{ word: "um", start: 0.1, end: 0.4 }]);
  assert.equal(f.data().personalNote, "Keep this note");
  assert.equal(f.data().createdAt, "original");
  assert.equal(f.data().transcribedAt, "server-time");
  assert.equal(f.data().status, undefined);
  assert.deepEqual(f.data().metrics, {
    wordCount: 5, wordsPerMinute: 25, fillerCount: 1, fillerWords: { um: 1 }, targetDurationStatus: null,
  });
  assert.equal(f.data().durationSeconds, 12);
  assert.ok(f.state.writes.every(({ path }) => path === recordingPath));
  assert.deepEqual(f.state.writes.map(({ data }) => data.processingStatus), ["transcribing", "transcript_ready", "transcript_ready"]);
  assert.equal(f.state.writes[1].data.metrics, undefined);
});

test("concurrent and repeated events ordinarily make only one paid request", async () => {
  const f = fixture();
  await Promise.all([f.run(), f.run(), f.run()]);
  await f.run();
  assert.equal(f.state.calls, 1);
  assert.equal(f.state.writes.length, 3);
  assert.equal(f.data().metrics.wordCount, 5);
});

test("metrics use persisted transcript, recording duration and current optional session target", async () => {
  const f = fixture({ metrics: { uniqueWords: 4, pauses: [1], custom: "keep", fillerWords: { uh: 99 } } });
  const siblingPath = `${sessionPath}/recordings/sibling`;
  f.documents.set(siblingPath, { metrics: { wordCount: 99 } });
  let calculations = 0;
  f.state.afterTranscriptSaved = () => { f.documents.get(sessionPath).targetDurationSeconds = 12; };
  f.dependencies.calculateMetrics = (input) => {
    calculations++;
    assert.deepEqual(input, { originalText: f.data().transcript.originalText, durationSeconds: 12, targetDurationSeconds: 12 });
    assert.equal(f.data().processingStatus, "transcript_ready");
    return calculateSpeakingMetrics(input);
  };
  await f.run();
  assert.equal(calculations, 1);
  assert.deepEqual(f.data().metrics, {
    uniqueWords: 4, pauses: [1], custom: "keep", wordCount: 5, wordsPerMinute: 25,
    fillerCount: 1, fillerWords: { um: 1 }, targetDurationStatus: "close",
  });
  assert.deepEqual(f.documents.get(siblingPath), { metrics: { wordCount: 99 } });
  const saved = structuredClone(f.data());
  f.event.data.generation = "124";
  await f.run();
  assert.equal(calculations, 1);
  assert.equal(f.state.calls, 1);
  assert.deepEqual(f.data(), saved);
});

test("calculator failure preserves transcript, audio and previous metrics without retranscription", async () => {
  const f = fixture({ metrics: { uniqueWords: 4 } });
  f.dependencies.calculateMetrics = () => { throw new Error("PRIVATE TRANSCRIPT CONTENT"); };
  await f.run();
  assert.equal(f.data().processingStatus, "failed");
  assert.deepEqual(f.data().processingError, { stage: "metrics", code: "metrics_calculation_failed" });
  assert.deepEqual(f.data().transcript, f.state.writes[1].data.transcript);
  assert.equal(f.data().audioPath, f.event.data.name);
  assert.equal(f.data().durationSeconds, 12);
  assert.deepEqual(f.data().metrics, { uniqueWords: 4 });
  assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
  await f.run();
  f.event.data.generation = "124";
  await f.run();
  assert.equal(f.state.calls, 1);
  assert.equal(f.state.downloads, 1);
});

test("metrics persistence failure never produces UI completion and retains the successful transcript", async () => {
  const { getMetricsProgress } = await import("../../utils/metricsProgress.js");
  const f = fixture();
  f.state.failMetricsWrite = true;
  await f.run();
  assert.equal(f.data().processingStatus, "failed");
  assert.deepEqual(f.data().processingError, { stage: "metrics_saving", code: "database_unavailable" });
  assert.deepEqual(f.data().transcript, f.state.writes[1].data.transcript);
  assert.equal(f.data().metrics, undefined);
  assert.ok(f.state.writes.every(({ data }) => !getMetricsProgress(data).ready));
  assert.deepEqual(getMetricsProgress(f.data()), { ready: false, active: false, failed: true });
  await f.run();
  f.event.data.generation = "124";
  await f.run();
  assert.equal(f.state.calls, 1);
});

test("a complete database outage after transcript save leaves metrics pending, never successful", async () => {
  const { getMetricsProgress } = await import("../../utils/metricsProgress.js");
  const f = fixture();
  f.state.afterTranscriptSaved = () => { f.state.failAllWrites = true; };
  await f.run();
  assert.equal(f.data().processingStatus, "transcript_ready");
  assert.ok(f.data().transcript.originalText);
  assert.equal(f.data().metrics, undefined);
  assert.deepEqual(getMetricsProgress(f.data()), { ready: false, active: true, failed: false });
  assert.ok(JSON.stringify(f.state.logs).includes("Could not persist metrics failure"));
  f.event.data.generation = "124";
  await f.run();
  assert.equal(f.state.calls, 1);
});

test("metrics cannot resurrect deleted documents or update a changed generation/status", async () => {
  for (const change of [
    (f) => f.documents.delete(recordingPath),
    (f) => f.documents.delete(sessionPath),
    (f) => { f.documents.get(sessionPath).deleting = true; },
    (f) => { f.data().transcriptionJob.generation = "124"; },
    (f) => { f.data().processingStatus = "analysing"; },
  ]) {
    const f = fixture();
    f.state.afterTranscriptSaved = () => change(f);
    f.dependencies.calculateMetrics = () => assert.fail("A stale worker must not calculate metrics");
    await f.run();
    assert.equal(f.state.writes.length, 2);
    assert.equal(f.data()?.metrics, undefined);
  }
});

test("UI metrics progress follows committed snapshots in order", async () => {
  const { getMetricsProgress } = await import("../../utils/metricsProgress.js");
  const f = fixture();
  await f.run();
  assert.deepEqual(f.state.writes.map(({ data }) => getMetricsProgress(data)), [
    { ready: false, active: false, failed: false },
    { ready: false, active: true, failed: false },
    { ready: true, active: false, failed: false },
  ]);
});

for (const status of ["transcribing", "transcript_ready", "analysing", "completed"]) {
  test(`ignores ${status} recordings even for another generation`, async () => {
    const f = fixture({ processingStatus: status });
    await f.run();
    assert.equal(f.state.calls, 0);
    assert.equal(f.data().processingStatus, status);
  });
}

test("legacy stored recordings are normalized without leaving two status fields", async () => {
  const f = fixture();
  f.documents.set(recordingPath, { duration: 12, status: "pending_upload",
    storagePath: "users/owner/sessions/session/recordings/attempt.m4a", personalNote: "legacy" });
  f.event.data.name = f.data().storagePath;
  await f.run();
  assert.equal(f.data().processingStatus, "transcript_ready");
  assert.equal(f.data().audioPath, f.event.data.name);
  assert.equal(f.data().durationSeconds, 12);
  assert.equal(f.data().status, undefined);
  assert.equal(f.data().storagePath, undefined);
  assert.equal(f.data().duration, undefined);
  assert.equal(f.data().personalNote, "legacy");
});

for (const change of [
  { name: "avatars/owner/photo.m4a" }, { name: "recordings/owner/session/attempt.mp3" },
  { bucket: "unrelated-bucket" }, { generation: "bad-generation" },
]) {
  test(`ignores unrelated event ${JSON.stringify(change)}`, async () => {
    const f = fixture(); Object.assign(f.event.data, change); await f.run();
    assert.equal(f.state.calls, 0); assert.equal(f.state.downloads, 0);
    assert.equal(f.data().processingStatus, "pending_upload");
  });
}

for (const parent of ["session", "recording", "deleting"]) {
  test(`ignores missing/deleting parent: ${parent}`, async () => {
    const f = fixture();
    if (parent === "deleting") f.documents.get(sessionPath).deleting = true;
    else f.documents.delete(parent === "session" ? sessionPath : recordingPath);
    await f.run(); assert.equal(f.state.calls, 0);
  });
}

test("rejects mismatched ownership and audio paths before any external call", async () => {
  for (const change of [{ userId: "other" }, { sessionId: "other" }, { audioPath: "unexpected.m4a" }]) {
    const f = fixture(); Object.assign(f.data(), change); await f.run();
    assert.equal(f.state.calls, 0); assert.equal(f.state.downloads, 0);
  }
});

for (const duration of [0, -1, 901, 1.5, undefined]) {
  test(`invalid duration fails safely: ${duration}`, async () => {
    const f = fixture({ durationSeconds: duration }); await f.run();
    assert.equal(f.data().processingStatus, "failed");
    assert.equal(f.data().processingError.code, "invalid_duration");
    assert.equal(f.state.calls, 0);
  });
}

for (const [change, code] of [
  [{ size: "0" }, "invalid_audio_size"], [{ size: String(MAX_AUDIO_BYTES + 1) }, "invalid_audio_size"],
  [{ contentType: "image/png" }, "unsupported_audio"],
]) {
  test(`invalid object fails safely: ${JSON.stringify(change)}`, async () => {
    const f = fixture(); Object.assign(f.event.data, change); await f.run();
    assert.equal(f.data().processingError.code, code); assert.equal(f.state.calls, 0);
  });
}

test("an invalid m4a header or missing Storage object fails without contacting Deepgram", async () => {
  for (const download of [async () => Buffer.alloc(12), async () => { throw { code: 404 }; }]) {
    const f = fixture(); f.dependencies.downloadAudio = download; await f.run();
    assert.equal(f.data().processingStatus, "failed"); assert.equal(f.state.calls, 0);
  }
});

for (const [error, code] of [
  [{ statusCode: 401 }, "provider_auth"], [{ statusCode: 403 }, "provider_auth"],
  [{ statusCode: 402 }, "provider_credits"], [{ statusCode: 429 }, "provider_rate_limit"],
  [{ name: "TimeoutError" }, "provider_timeout"], [{ statusCode: 503 }, "provider_unavailable"],
  [new Error("PRIVATE PROVIDER BODY"), "provider_unavailable"],
  [processingError("secret_missing"), "secret_missing"],
]) {
  test(`safe provider failure: ${code} ${error.statusCode ?? error.name}`, async () => {
    const f = fixture(); f.state.error = error; await f.run(); await f.run();
    assert.equal(f.data().processingStatus, "failed");
    assert.equal(f.data().processingError.code, code);
    assert.equal(f.state.calls, 1);
    assert.ok(!JSON.stringify(f.state.logs).includes("PRIVATE"));
  });
}

test("failed generation is deduplicated; a manual new-generation upload can retry", async () => {
  const f = fixture(); f.state.error = { statusCode: 429 }; await f.run();
  delete f.state.error;
  await f.run(); assert.equal(f.state.calls, 1);
  f.event.data.generation = "124"; await f.run();
  assert.equal(f.state.calls, 2); assert.equal(f.data().processingStatus, "transcript_ready");
  assert.equal(f.data().processingError, undefined);
});

test("out-of-order events cannot reclaim an older failed generation", async () => {
  const f = fixture(); f.state.error = { statusCode: 429 };
  await f.run();
  f.event.data.generation = "124"; await f.run();
  f.event.data.generation = "123"; await f.run();
  assert.equal(f.state.calls, 2);
  assert.equal(f.data().transcriptionJob.generation, "124");
});

test("invalid responses and silence are failed, never successful transcripts", async () => {
  for (const response of [{}, { ...result, metadata: { duration: 1500 } },
    { ...result, results: { channels: [{ alternatives: [{ transcript: "  " }] }] } }]) {
    const f = fixture(); f.state.response = response; await f.run();
    assert.equal(f.data().processingStatus, "failed"); assert.equal(f.data().transcript, undefined);
  }
});

test("deletion during download or provider work cannot recreate recording data", async () => {
  const duringDownload = fixture();
  duringDownload.dependencies.downloadAudio = async () => { duringDownload.documents.delete(sessionPath); return audio; };
  await duringDownload.run(); assert.equal(duringDownload.state.calls, 0);
  const duringApi = fixture();
  duringApi.state.duringTranscription = () => { duringApi.documents.delete(sessionPath); duringApi.documents.delete(recordingPath); };
  await duringApi.run(); assert.equal(duringApi.data(), undefined);
});

test("a failed transcript write records failure without retrying Deepgram", async () => {
  const f = fixture(); f.state.failSuccessWrite = true; await f.run(); await f.run();
  assert.equal(f.data().processingStatus, "failed");
  assert.equal(f.data().processingError.code, "database_unavailable");
  assert.equal(f.state.calls, 1);
});

test("database outage before claim causes no paid request", async () => {
  const f = fixture(); f.state.failAllWrites = true; await f.run();
  assert.equal(f.state.calls, 0);
});

test("database outage after API success is logged; repeated event does not pay again", async () => {
  const f = fixture(); f.state.duringTranscription = () => { f.state.failAllWrites = true; };
  await f.run(); await f.run();
  assert.equal(f.state.calls, 1); assert.equal(f.data().processingStatus, "transcribing");
  assert.ok(JSON.stringify(f.state.logs).includes("Could not persist transcription failure"));
});

test("oversized word data is omitted and oversized text fails within document budget", () => {
  const response = structuredClone(result);
  response.results.channels[0].alternatives[0].words = Array.from({ length: 20000 }, () => ({ word: "um", start: 0, end: 1 }));
  assert.equal(extractTranscript(response).words, undefined);
  response.results.channels[0].alternatives[0].transcript = "a".repeat(200001);
  assert.throws(() => extractTranscript(response), /transcript_too_large/);
});

test("installed SDK sends binary audio and every required option, with retries disabled", async () => {
  let calls = 0;
  const response = await transcribe(audio, "test-only-key", {
    fetcher: async (request) => {
      calls++;
      assert.equal(request.method, "POST");
      assert.equal(request.url, "https://api.deepgram.com/v1/listen");
      const query = new URLSearchParams(request.queryString);
      for (const [key, value] of Object.entries({ model: "nova-3", language: "en", smart_format: "true",
        filler_words: "true", mip_opt_out: "true", diarize: "false" })) assert.equal(query.get(key), value);
      assert.equal(request.maxRetries, 0);
      assert.equal(request.timeoutMs, 180000);
      assert.equal(new Headers(request.headers).get("content-type"), "audio/mp4");
      assert.deepEqual(Buffer.from(request.body), audio);
      return { ok: true, body: result, headers: {} };
    },
  });
  assert.equal(calls, 1); assert.deepEqual(response, result);
});

test("missing secret fails before constructing a provider request", async () => {
  await assert.rejects(transcribe(audio, ""), /secret_missing/);
});

test("SDK HTTP transport does not retry a rate limit response", async () => {
  let calls = 0;
  await assert.rejects(transcribe(audio, "test-only-key", {
    fetch: async (url, init) => {
      calls++;
      assert.ok(url.includes("mip_opt_out=true"));
      assert.equal(new Headers(init.headers).get("content-type"), "audio/mp4");
      return new Response(JSON.stringify({ err_code: "RATE_LIMIT" }), {
        status: 429, headers: { "Content-Type": "application/json" },
      });
    },
  }), (error) => error.statusCode === 429);
  assert.equal(calls, 1);
});
