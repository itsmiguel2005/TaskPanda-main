const test = require("node:test");
const assert = require("node:assert/strict");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { handleListMessages } = require("./messageController");

const originalFindOne = Conversation.findOne;
const originalUpdateOne = Conversation.updateOne;
const originalFind = Message.find;

test.afterEach(() => {
  Conversation.findOne = originalFindOne;
  Conversation.updateOne = originalUpdateOne;
  Message.find = originalFind;
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
