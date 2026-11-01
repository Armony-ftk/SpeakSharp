const { initializeApp } = require("firebase-admin/app");

initializeApp();

const { deleteSession } = require("./deletion");
const { transcribeRecording } = require("./transcription");
const { analyseRecording, retryRecordingAnalysis } = require("./analysis");

exports.deleteSession = deleteSession;
exports.deleteAccount = require("./deleteAccount").deleteAccount;
exports.deleteRecording = require("./deleteRecording").deleteRecording;
exports.transcribeRecording = transcribeRecording;
exports.analyseRecording = analyseRecording;
exports.retryRecordingAnalysis = retryRecordingAnalysis;

const { getAdminStats } = require("./admin");
const { getUsers } = require("./adminUsers");
const { getUserDetails } = require("./adminReadOnly");
const {
  getActivityLogs,
  recordSessionCreated,
} = require("./adminActivity");
const { setUserDisabled } = require("./adminSuspension");

exports.getAdminStats = getAdminStats;
exports.getUsers = getUsers;
exports.getUserDetails = getUserDetails;
exports.getActivityLogs = getActivityLogs;
exports.recordSessionCreated = recordSessionCreated;
exports.setUserDisabled = setUserDisabled;
