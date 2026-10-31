const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { logger } = require("firebase-functions");
const { onCall } = require("firebase-functions/v2/https");
const { createRecordingDeletion } = require("./recordingDeletion");

exports.deleteRecording = onCall({
  region: "us-central1", invoker: "public", timeoutSeconds: 120, memory: "256MiB",
}, (request) => createRecordingDeletion({ db: getFirestore(), bucket: getStorage().bucket(), logger })(request));
