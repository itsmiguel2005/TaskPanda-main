const test = require("node:test");
const assert = require("node:assert/strict");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { handleListConversations, handleListMessages } = require("./messageController");

const originalConversationFind = Conversation.find;
const originalFindOne = Conversation.findOne;
const originalUpdateOne = Conversation.updateOne;
const originalFind = Message.find;
const originalAggregate = Message.aggregate;

test.afterEach(() => {
  Conversation.find = originalConversationFind;
  Conversation.findOne = originalFindOne;
  Conversation.updateOne = originalUpdateOne;
  Message.find = originalFind;
  Message.aggregate = originalAggregate;
});

test("conversation details include the booking request photo", async () => {
  const conversationId = "64b000000000000000000001";
  const clientId = "64b000000000000000000002";
  const providerId = "64b000000000000000000003";
  const photoUrl = "https://res.cloudinary.com/taskpanda/image/upload/request-photo.jpg";
  const secondPhotoUrl = "https://res.cloudinary.com/taskpanda/image/upload/request-photo-2.jpg";
  let populateSelection = "";
  const conversation = {
    _id: conversationId,
    bookingId: {
      _id: "64b000000000000000000004",
      repairDescription: "Repair the phone screen",
      photoUrl,
      photoUrls: [photoUrl, secondPhotoUrl],
      status: "pending",
      counterOffers: [],
      revisionRequests: [],
    },
    clientId: { _id: clientId, fullName: "Client" },
    providerId: { _id: providerId, fullName: "Provider", professions: ["Repair"] },
    updatedAt: new Date(),
    lastMessage: "Photo attachment",
  };
  Conversation.find = () => ({
    sort() { return this; },
    populate: async (selection) => {
      populateSelection = selection.find((entry) => entry.path === "bookingId").select;
      return [conversation];
    },
  });
  Message.aggregate = async () => [];

  const response = {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await handleListConversations({ query: { tab: "active" }, user: { _id: clientId, role: "client" } }, response);

  assert.equal(response.statusCode, 200);
  assert.match(populateSelection, /\bphotoUrl\b/);
  assert.match(populateSelection, /\bphotoUrls\b/);
  assert.deepEqual(response.body.conversations[0].photoUrls, [photoUrl, secondPhotoUrl]);
});

test("loading a conversation clears unread messages even inside the read timestamp throttle", async () => {
  const conversationId = "64b000000000000000000001";
  const userId = "64b000000000000000000002";
  let readStateFilter;
  let readStateUpdate;

  Conversation.findOne = () => ({
    select: async () => ({
      _id: conversationId,
      lastReadAtClient: new Date(),
    }),
  });
  Conversation.updateOne = async (filter, update) => {
    readStateFilter = filter;
    readStateUpdate = update;
    return { modifiedCount: 1 };
  };
  Message.find = () => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => [],
  });

  const response = {
    statusCode: 200,
    headers: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };

  await handleListMessages({
    params: { conversationId },
    query: {},
    user: { _id: userId, role: "client" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "private, no-store");
  assert.ok(readStateFilter.$or.some((condition) => condition.unreadCountClient?.$gt === 0));
  assert.equal(readStateUpdate.$set.unreadCountClient, 0);
  assert.ok(readStateUpdate.$set.lastReadAtClient instanceof Date);
});
