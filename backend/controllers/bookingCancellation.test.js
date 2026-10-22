const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { handleCancellation } = require("./bookingController");

const originalFindById = Booking.findById;
const originalConversationFindOne = Conversation.findOne;
const originalConversationCreate = Conversation.create;
const originalConversationUpdateOne = Conversation.updateOne;
const originalMessageCreate = Message.create;

test.afterEach(() => {
  Booking.findById = originalFindById;
  Conversation.findOne = originalConversationFindOne;
  Conversation.create = originalConversationCreate;
  Conversation.updateOne = originalConversationUpdateOne;
  Message.create = originalMessageCreate;
});

function createBooking(status, createdAt = new Date()) {
  const booking = {
    _id: "64b000000000000000000101",
    clientId: "64b000000000000000000102",
    providerId: "64b000000000000000000103",
    status,
    createdAt,
    serviceDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    timeSlot: "9:00 AM",
    statusHistory: [{ status, at: createdAt }],
    saveCalls: 0,
    async save() {
      this.saveCalls += 1;
    },
    async populate() {
      return this;
    },
  };
  return booking;
}

async function submitCancellationRequest(booking, role, reason = "") {
  Booking.findById = async () => booking;
  Conversation.findOne = async () => null;
  Conversation.create = async () => ({ _id: "64b000000000000000000104" });
  Conversation.updateOne = async () => ({ modifiedCount: 1 });
  Message.create = async () => ({ createdAt: new Date() });

  let responseStatus;
  let responseBody;
  const response = {
    status(status) {
      responseStatus = status;
      return this;
    },
    json(body) {
      responseBody = body;
      return this;
    },
  };
  await handleCancellation(
    {
      params: { id: booking._id },
      body: { action: "request", reason },
      user: {
        _id: role === "provider" ? booking.providerId : booking.clientId,
        role,
      },
    },
    response
  );
  return { responseStatus, responseBody, booking };
}

test("provider cancellation of a confirmed booking always requests client approval inside the creation grace", async () => {
  const booking = createBooking("approved", new Date());
  const result = await submitCancellationRequest(booking, "provider", "Unable to attend");

  assert.equal(result.responseStatus, undefined);
  assert.equal(booking.status, "cancel_requested");
  assert.equal(booking.cancellationRequestedBy, "provider");
  assert.equal(booking.cancellationPreviousStatus, "approved");
  assert.equal(booking.cancellationReason, "Unable to attend");
  assert.ok(booking.cancellationExpiresAt instanceof Date);
  assert.equal(booking.cancellationOutcome, undefined);
  assert.equal(booking.saveCalls, 1);
});

test("provider cancellation of a confirmed booking requires a reason inside the creation grace", async () => {
  const booking = createBooking("approved", new Date());
  const result = await submitCancellationRequest(booking, "provider");

  assert.equal(result.responseStatus, 400);
  assert.equal(result.responseBody.message, "Add a brief reason for the cancellation request.");
  assert.equal(booking.status, "approved");
  assert.equal(booking.saveCalls, 0);
});

test("provider cancellation of a pending request keeps the immediate 10-minute grace", async () => {
  const booking = createBooking("pending", new Date());
  await submitCancellationRequest(booking, "provider");

  assert.equal(booking.status, "canceled");
  assert.equal(booking.cancellationOutcome, "instant");
  assert.equal(booking.saveCalls, 1);
});

test("client cancellation of a confirmed booking keeps the existing immediate 10-minute grace", async () => {
  const booking = createBooking("approved", new Date());
  await submitCancellationRequest(booking, "client");

  assert.equal(booking.status, "canceled");
  assert.equal(booking.cancellationOutcome, "instant");
  assert.equal(booking.saveCalls, 1);
});
