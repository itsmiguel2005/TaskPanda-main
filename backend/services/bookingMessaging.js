const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

function idOf(value) {
  return value?._id || value;
}

function formatAmount(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH")}`;
}

function bookingDateText(booking) {
  const date = new Date(booking.serviceDate);
  const dateText = Number.isNaN(date.getTime())
    ? "Date to be confirmed"
    : date.toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" });
  return booking.timeSlot ? `${dateText} at ${booking.timeSlot}` : dateText;
}

async function getOrCreateConversation(booking) {
  let conversation = await Conversation.findOne({ bookingId: idOf(booking) });
  if (conversation) return conversation;
  try {
    return await Conversation.create({
      bookingId: idOf(booking),
      clientId: idOf(booking.clientId),
      providerId: idOf(booking.providerId),
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    conversation = await Conversation.findOne({ bookingId: idOf(booking) });
    if (!conversation) throw error;
    return conversation;
  }
}

async function appendSystemMessageToConversation(conversation, booking, text, senderId, eventType = "system", eventData = undefined) {
  const message = await Message.create({
    conversationId: conversation._id,
    sender: idOf(senderId || booking.providerId || booking.clientId),
    senderRole: "system",
    text,
    eventType,
    eventData: { bookingId: String(idOf(booking)), ...(eventData || {}) },
  });
  const update = {
    $set: { lastMessage: text, lastMessageAt: message.createdAt },
    $inc: {},
  };
  const senderIdValue = String(idOf(senderId || booking.providerId || booking.clientId));
  if (senderIdValue === String(idOf(booking.clientId))) {
    update.$inc.unreadCountProvider = 1;
  } else if (senderIdValue === String(idOf(booking.providerId))) {
    update.$inc.unreadCountClient = 1;
  } else {
    update.$inc.unreadCountClient = 1;
    update.$inc.unreadCountProvider = 1;
  }
  await Conversation.updateOne({ _id: conversation._id }, update);
  return message;
}

async function ensureBookingConversation(booking) {
  const conversation = await getOrCreateConversation(booking);
  const existingMessage = await Message.exists({ conversationId: conversation._id });
  if (!existingMessage) {
    const text = `New Booking Request: ${booking.repairDescription} for ${formatAmount(booking.offeredPrice)} on ${bookingDateText(booking)} - Payment Method: Cash on Completion`;
    await appendSystemMessageToConversation(conversation, booking, text, booking.clientId, "booking_request", {
      bookingId: String(idOf(booking)),
      repairDescription: booking.repairDescription,
      offeredPrice: booking.offeredPrice,
      serviceDate: booking.serviceDate,
      timeSlot: booking.timeSlot,
      paymentMethod: booking.paymentMethod || "cash",
    });
  }
  return conversation;
}

async function appendBookingSystemMessage(booking, text, senderId, eventType = "system", eventData = undefined) {
  const conversation = await getOrCreateConversation(booking);
  return appendSystemMessageToConversation(conversation, booking, text, senderId, eventType, eventData);
}

module.exports = { ensureBookingConversation, appendBookingSystemMessage, formatAmount, bookingDateText };
