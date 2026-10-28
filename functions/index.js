const { initializeApp } = require("firebase-admin/app");

initializeApp();

const { deleteSession } = require("./deletion");
const { transcribeRecording } = require("./transcription");

exports.deleteSession = deleteSession;
exports.transcribeRecording = transcribeRecording;
