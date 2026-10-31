const { initializeApp } = require("firebase-admin/app");

initializeApp();

const { deleteSession } = require("./deletion");
const { transcribeRecording } = require("./transcription");
const { analyseRecording, retryRecordingAnalysis } = require("./analysis");

exports.deleteSession = deleteSession;
exports.deleteRecording = require("./deleteRecording").deleteRecording;
exports.transcribeRecording = transcribeRecording;
exports.analyseRecording = analyseRecording;
exports.retryRecordingAnalysis = retryRecordingAnalysis;
