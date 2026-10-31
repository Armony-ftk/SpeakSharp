const { GoogleGenAI } = require("@google/genai");
const { getFirestore } = require("firebase-admin/firestore");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall } = require("firebase-functions/v2/https");
const { SYSTEM_INSTRUCTION, responseJsonSchema } = require("./aiFeedback");
const { createAnalysisProcessor, createAnalysisRetry } = require("./analysisProcessor");
const { processingError } = require("./transcriptionProcessor");

const geminiApiKey = defineSecret("GEMINI_API_KEY");
const MODEL = "gemini-3.5-flash-lite";

async function generateFeedback(presentation, apiKey = geminiApiKey.value(), httpOptions = {}) {
  if (!apiKey?.trim()) throw processingError("analysis_auth");
  const client = new GoogleGenAI({
    apiKey, vertexai: false,
    httpOptions: { ...httpOptions, timeout: 120000, retryOptions: { attempts: 1 } },
  });
  return client.models.generateContent({
    model: MODEL,
    contents: JSON.stringify(presentation),
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseJsonSchema,
      maxOutputTokens: 6000,
      candidateCount: 1,
      thinkingConfig: { thinkingLevel: "LOW" },
    },
  });
}

const analyseRecording = onDocumentUpdated({
  document: "users/{userId}/sessions/{sessionId}/recordings/{recordingId}",
  region: "us-central1",
  secrets: [geminiApiKey],
  timeoutSeconds: 300,
  memory: "256MiB",
  cpu: "gcf_gen1",
  concurrency: 1,
  minInstances: 0,
  maxInstances: 2,
  retry: false,
}, (event) => createAnalysisProcessor({ db: getFirestore(), generate: generateFeedback, logger })(event));

const retryRecordingAnalysis = onCall({
  region: "us-central1", invoker: "public", timeoutSeconds: 60, memory: "256MiB",
}, (request) => createAnalysisRetry({ db: getFirestore(), logger })(request));

module.exports = { analyseRecording, retryRecordingAnalysis, generateFeedback, MODEL };
