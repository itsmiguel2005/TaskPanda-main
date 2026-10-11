const test = require("node:test");
const assert = require("node:assert/strict");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const oneSignal = require("../services/oneSignal");
const {
  buildSupportReportsPipeline,
  handleUpdateAdminSupportReport,
} = require("./adminSupportReportsController");

const originalConversationFindOne = Conversation.findOne;
const originalConversationFindOneAndUpdate = Conversation.findOneAndUpdate;
const originalUserFindOneAndUpdate = User.findOneAndUpdate;
const originalSendPushNotification = oneSignal.sendPushNotification;

test.afterEach(() => {
  Conversation.findOne = originalConversationFindOne;
  Conversation.findOneAndUpdate = originalConversationFindOneAndUpdate;
  User.findOneAndUpdate = originalUserFindOneAndUpdate;
  oneSignal.sendPushNotification = originalSendPushNotification;
});

test("admin support report query paginates open reports and joins only participant summaries", () => {
  const pipeline = buildSupportReportsPipeline("open", 2, 25);
  assert.deepEqual(pipeline[0], { $match: { "supportReports.status": "open" } });
  assert.deepEqual(pipeline[1], { $unwind: "$supportReports" });
  const facet = pipeline.find((stage) => stage.$facet)?.$facet;
  assert.deepEqual(facet.reports.slice(0, 2), [
    { $skip: 25 },
    { $limit: 25 },
  ]);
  assert.ok(facet.reports.some((stage) => stage.$lookup?.as === "reporter"));
  assert.ok(facet.reports.some((stage) => stage.$lookup?.as === "booking"));
});

test("admin support report query can include all report states", () => {
  const pipeline = buildSupportReportsPipeline("all", 1);
  assert.deepEqual(pipeline[0], { $unwind: "$supportReports" });
  assert.equal(pipeline.some((stage) => stage.$match?.["supportReports.status"]), false);
});

test("support-report suspension revokes account sessions and records the admin reason", async () => {
  const conversationId = "64b000000000000000000001";
  const reportId = "64b000000000000000000002";
  const reportedUserId = "64b000000000000000000003";
  let userUpdate;
  let reportUpdate;

  Conversation.findOne = () => ({
    select: () => ({
      lean: async () => ({
        clientId: "64b000000000000000000004",
        providerId: reportedUserId,
        supportReports: [{ _id: reportId, reporterRole: "client" }],
      }),
    }),
  });
  User.findOneAndUpdate = (_filter, update) => {
    userUpdate = update;
    return { select: async () => ({ _id: reportedUserId, isSuspended: true }) };
  };
  Conversation.findOneAndUpdate = (_filter, update) => {
    reportUpdate = update;
    return {
      lean: async () => ({
        supportReports: [{ _id: reportId, status: "open", adminNotes: "" }],
      }),
    };
  };

  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handleUpdateAdminSupportReport({
    params: { conversationId, reportId },
    body: { action: "suspend", reason: "Repeated abusive messages" },
    adminEmail: "admin@example.com",
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, "Reported account suspended and active sessions revoked.");
  assert.deepEqual(userUpdate.$set, { isSuspended: true, suspendedAt: userUpdate.$set.suspendedAt, accountTokens: [] });
  assert.equal(userUpdate.$push.adminActivity.$each[0].reason, "Repeated abusive messages");
  assert.equal(userUpdate.$push.adminActivity.$each[0].actorEmail, "admin@example.com");
  assert.equal(reportUpdate.$push["supportReports.$.moderationHistory"].$each[0].action, "suspended");
});

test("support-report resolution updates the matching report and records admin notes", async () => {
  const conversationId = "64b000000000000000000001";
  const reportId = "64b000000000000000000002";
  let reportFilter;
  let reportUpdate;
  let reportOptions;

  Conversation.findOneAndUpdate = (filter, update, options) => {
    reportFilter = filter;
    reportUpdate = update;
    reportOptions = options;
    return {
      lean: async () => ({
        supportReports: [
          { _id: "64b000000000000000000009", status: "open" },
          { _id: reportId, status: "resolved", adminNotes: "Reviewed and closed" },
        ],
      }),
    };
  };

  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handleUpdateAdminSupportReport({
    params: { conversationId, reportId },
    body: { action: "resolve", notes: "Reviewed and closed" },
    adminEmail: "admin@example.com",
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.id, reportId);
  assert.equal(response.body.status, "resolved");
  assert.equal(reportFilter["supportReports._id"], reportId);
  assert.equal(reportUpdate.$set["supportReports.$.status"], "resolved");
  assert.equal(reportUpdate.$set["supportReports.$.adminNotes"], "Reviewed and closed");
  assert.equal(reportUpdate.$push["supportReports.$.moderationHistory"].$each[0].action, "resolved");
  assert.deepEqual(reportOptions.projection, { supportReports: 1 });
});

test("support-report warning saves an in-app notification and attempts push delivery", async () => {
  const conversationId = "64b000000000000000000001";
  const reportId = "64b000000000000000000002";
  const reportedUserId = "64b000000000000000000003";
  const warning = "Please follow the platform's conduct rules.";
  let userFilter;
  let userUpdate;
  let reportUpdate;
  let pushPayload;

  Conversation.findOne = () => ({
    select: () => ({
      lean: async () => ({
        clientId: "64b000000000000000000004",
        providerId: reportedUserId,
        supportReports: [{ _id: reportId, reporterRole: "client" }],
      }),
    }),
  });
  User.findOneAndUpdate = (filter, update) => {
    userFilter = filter;
    userUpdate = update;
    return { select: async () => ({ _id: reportedUserId, role: "provider" }) };
  };
  oneSignal.sendPushNotification = async (payload) => {
    pushPayload = payload;
    return { id: "notification-id" };
  };
  Conversation.findOneAndUpdate = (_filter, update) => {
    reportUpdate = update;
    return {
      lean: async () => ({
        supportReports: [{ _id: reportId, status: "open", adminNotes: "" }],
      }),
    };
  };

  const response = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handleUpdateAdminSupportReport({
    params: { conversationId, reportId },
    body: { action: "send_warning", reason: warning },
    adminEmail: "admin@example.com",
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.message, "In-app warning saved and push notification delivered.");
  assert.equal(userFilter._id, reportedUserId);
  assert.equal(userUpdate.$push.verificationNotifications.$each[0].message, warning);
  assert.equal(User.schema.path("verificationNotifications").schema.path("message").options.maxlength, 500);
  assert.equal(userUpdate.$push.adminActivity.$each[0].action, "warned");
  assert.equal(pushPayload.userIds[0], reportedUserId);
  assert.equal(reportUpdate.$push["supportReports.$.moderationHistory"].$each[0].action, "warned");
});
