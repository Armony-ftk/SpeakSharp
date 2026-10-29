const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { logger } = require("firebase-functions");
const { defineSecret } = require("firebase-functions/params");
const { onObjectFinalized } = require("firebase-functions/v2/storage");
const { DeepgramClient } = require("@deepgram/sdk");
const { createTranscriptionProcessor, processingError, MAX_AUDIO_BYTES } = require("./transcriptionProcessor");

const BUCKET = "speaksharp-3893c.firebasestorage.app";
const deepgramApiKey = defineSecret("DEEPGRAM_API_KEY");
const DEEPGRAM_OPTIONS = {
  model: "nova-3", language: "en", smart_format: true,
  filler_words: true, mip_opt_out: true, diarize: false,
};

async function downloadAudio(object) {
  const file = getStorage().bucket(object.bucket).file(object.name, { generation: object.generation });
  const stream = file.createReadStream();
  const timer = setTimeout(() => stream.destroy(processingError("audio_timeout")), 45000);
  try {
    const chunks = [];
    let length = 0;
    for await (const chunk of stream) {
      length += chunk.length;
      if (length > MAX_AUDIO_BYTES) throw processingError("invalid_audio_size");
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    stream.destroy();
  }
}

async function transcribe(audio, apiKey = deepgramApiKey.value(), options = {}) {
  if (!apiKey?.trim()) throw processingError("secret_missing");
  const client = new DeepgramClient({ apiKey, ...options });
  // SDK v5 returns the response directly and throws on failure. Disable its default retries.
  return client.listen.v1.media.transcribeFile(audio, DEEPGRAM_OPTIONS, {
    timeoutInSeconds: 180, maxRetries: 0, headers: { "Content-Type": "audio/mp4" },
  });
}

const transcribeRecording = onObjectFinalized({
  bucket: BUCKET,
  // Verified through Storage bucket metadata; the existing callable stays in us-central1.
  region: "africa-south1",
  secrets: [deepgramApiKey],
  timeoutSeconds: 300,
  memory: "512MiB",
  cpu: "gcf_gen1",
  concurrency: 1,
  minInstances: 0,
  maxInstances: 2,
  // Late-upload cleanup and pre-provider claims can request redelivery; provider failures
  // remain caught by the processor and do not repeat paid transcription.
  retry: true,
}, (event) => createTranscriptionProcessor({
  db: getFirestore(), bucketName: BUCKET, downloadAudio, transcribe, logger,
  deleteAudio: (object) => getStorage().bucket(object.bucket)
    .file(object.name, { generation: object.generation }).delete({ ignoreNotFound: true }),
})(event));

module.exports = { transcribeRecording, transcribe };
