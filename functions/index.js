const { deleteSession } = require("./deletion");
const { getAdminStats } = require("./admin");
const { getUsers } = require("./adminUsers");
const { getUserDetails } = require("./adminReadOnly");
const {
  getActivityLogs,
  recordSessionCreated,
} = require("./adminActivity");
const { setUserDisabled } = require("./adminSuspension");

exports.deleteSession = deleteSession;
exports.getAdminStats = getAdminStats;
exports.getUsers = getUsers;
exports.getUserDetails = getUserDetails;
exports.getActivityLogs = getActivityLogs;
exports.recordSessionCreated = recordSessionCreated;
exports.setUserDisabled = setUserDisabled;
