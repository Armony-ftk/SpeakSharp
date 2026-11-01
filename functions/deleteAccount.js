const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");
const { logger } = require("firebase-functions");
const { onCall } = require("firebase-functions/v2/https");
const { createAccountDeletion } = require("./accountDeletion");

exports.deleteAccount = onCall({ region: "us-central1", invoker: "public", timeoutSeconds: 540, memory: "512MiB" },
  (request) => createAccountDeletion({ db: getFirestore(), auth: getAuth(), bucket: getStorage().bucket(), logger })(request));
