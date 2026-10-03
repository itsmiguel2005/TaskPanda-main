const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const { ensureBookingConversation, appendBookingSystemMessage, formatAmount } = require("../services/bookingMessaging");
const { calculateTotalPrice } = require("../services/bookingPricing");
const {
  deleteChatPhoto,
  fetchAuthenticatedChatPhoto,
  isOwnedChatPhotoPublicId,
  uploadChatPhoto,
  verifyChatPhotoUploads,
} = require("../services/cloudinaryMedia");
const MESSAGE_PAGE_SIZE = 50;

const conversationPopulate = [
  { path: "clientId", select: "fullName username email profileImage" },
  { path: "providerId", select: "fullName username email professions profileImage" },
  { path: "bookingId", select: "repairDescription status serviceDate timeSlot offeredPrice travelDistanceKm travelFee tipAmount paymentMethod cashPaidConfirmedAt cashReceivedConfirmedAt clientConfirmedCash providerConfirmedCash workCompletedAt settledAt cashReceipt completionNote completionPhotos completionSubmittedAt revisionRequests createdAt counterOffers clientRating clientReview clientReviewPhotos reviewedAt" },
];

function serializeConversation(conversation, role) {
  const client = conversation.clientId && typeof conversation.clientId === "object" ? conversation.clientId : null;
  const provider = conversation.providerId && typeof conversation.providerId === "object" ? conversation.providerId : null;
  const booking = conversation.bookingId && typeof conversation.bookingId === "object" ? conversation.bookingId : null;
  const other = role === "client" ? provider : client;
  return {
    id: String(conversation._id),
    bookingId: String(booking?._id || conversation.bookingId),
    clientId: String(client?._id || conversation.clientId),
    providerId: String(provider?._id || conversation.providerId),
    name: other?.fullName || other?.username || other?.email || (role === "client" ? "Provider" : "Client"),
    profileImage: other?.profileImage || "",
    cred: provider?.professions?.join(" · ") || "Service provider",
    task: booking?.repairDescription || "Service booking",
    bookingStatus: booking?.status || "",
    bookingCreatedAt: booking?.createdAt || null,
    serviceDate: booking?.serviceDate || null,
    timeSlot: booking?.timeSlot || "",
    offeredPrice: booking?.offeredPrice ?? 0,
    travelDistanceKm: booking?.travelDistanceKm ?? null,
    travelFee: booking?.travelFee ?? 0,
    tipAmount: booking?.tipAmount ?? 0,
    totalPrice: calculateTotalPrice(booking?.offeredPrice ?? 0, booking?.travelFee ?? 0, booking?.tipAmount ?? 0),
    paymentMethod: booking?.paymentMethod || "cash",
    cashPaidConfirmedAt: booking?.cashPaidConfirmedAt || null,
    cashReceivedConfirmedAt: booking?.cashReceivedConfirmedAt || null,
    clientConfirmedCash: Boolean(booking?.clientConfirmedCash || booking?.cashPaidConfirmedAt),
    providerConfirmedCash: Boolean(booking?.providerConfirmedCash || booking?.cashReceivedConfirmedAt),
    cashReceipt: booking?.cashReceipt || null,
    completionNote: booking?.completionNote || "",
    completionPhotos: booking?.completionPhotos || [],
    completionSubmittedAt: booking?.completionSubmittedAt || null,
    clientRating: booking?.clientRating ?? null,
    clientReview: booking?.clientReview || "",
    clientReviewPhotos: booking?.clientReviewPhotos || [],
    reviewedAt: booking?.reviewedAt || null,
    revisionRequests: (booking?.revisionRequests || []).map((request) => ({
      id: String(request._id),
      note: request.note,
      photos: request.photos || [],
      status: request.status,
      responseNote: request.responseNote || "",
      createdAt: request.createdAt,
      respondedAt: request.respondedAt || null,
    })),
    pendingCounterOffer: booking?.counterOffers?.find((offer) => offer.status === "pending") ? {
      id: String(booking.counterOffers.find((offer) => offer.status === "pending")._id),
      proposedBy: booking.counterOffers.find((offer) => offer.status === "pending").proposedBy,
      proposedPrice: booking.counterOffers.find((offer) => offer.status === "pending").proposedPrice ?? booking.offeredPrice,
      proposedServiceDate: booking.counterOffers.find((offer) => offer.status === "pending").proposedServiceDate || booking.serviceDate,
      proposedTimeSlot: booking.counterOffers.find((offer) => offer.status === "pending").proposedTimeSlot || booking.timeSlot,
      proposedRepairDescription: booking.counterOffers.find((offer) => offer.status === "pending").proposedRepairDescription || booking.repairDescription,
      note: booking.counterOffers.find((offer) => offer.status === "pending").note || "",
    } : null,
    isArchivedByClient: Boolean(conversation.isArchivedByClient),
    isArchivedByProvider: Boolean(conversation.isArchivedByProvider),
    isArchived: role === "client" ? Boolean(conversation.isArchivedByClient) : Boolean(conversation.isArchivedByProvider),
    unreadCount: role === "client" ? Number(conversation.unreadCountClient || 0) : Number(conversation.unreadCountProvider || 0),
    lastMessage: conversation.lastMessage || "No messages yet",
    updatedAt: conversation.updatedAt,
    lastMessageAt: conversation.lastMessageAt || conversation.updatedAt,
  };
}

function serializeMessage(message, currentUserId) {
  const messageId = String(message._id || message.id);
  const conversationId = String(message.conversationId);
  return {
    id: messageId,
    conversationId,
    senderId: String(message.sender?._id || message.sender),
    senderRole: message.senderRole,
    isMine: String(message.sender?._id || message.sender) === String(currentUserId),
    text: message.text,
    photos: (message.photos || []).map((photo, index) => photo && typeof photo === "object" && photo.publicId
      ? `/api/messages/${conversationId}/${messageId}/photos/${index}`
      : typeof photo === "string" ? photo : ""),
    eventType: message.eventType || "",
    eventData: message.eventData || null,
    createdAt: message.createdAt,
  };
}

function participantFilter(user) {
  if (user.role === "client") return { clientId: user._id };
  if (user.role === "provider") return { providerId: user._id };
  return null;
}

async function handleListConversations(req, res) {
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });
  const archiveField = req.user.role === "client" ? "isArchivedByClient" : "isArchivedByProvider";
  if (req.query.includeArchived === "true") {
    filter[archiveField] = true;
  } else {
    filter.$or = [
      { [archiveField]: false },
      { [archiveField]: mongoose.trusted({ $exists: false }) },
    ];
  }

  try {
    const conversations = await Conversation.find(filter)
      .sort({ lastMessageAt: -1, _id: -1 })
      .populate(conversationPopulate);
    const latestMessageSenders = conversations.length
      ? await Message.aggregate([
        { $match: { conversationId: { $in: conversations.map((conversation) => conversation._id) } } },
        { $sort: { createdAt: -1, _id: -1 } },
        { $group: { _id: "$conversationId", sender: { $first: "$sender" } } },
      ])
      : [];
    const senderByConversation = new Map(latestMessageSenders.map(({ _id, sender }) => [String(_id), String(sender)]));
    const currentUserId = String(req.user._id);
    return res.json({ conversations: conversations.map((conversation) => ({
      ...serializeConversation(conversation, req.user.role),
      lastMessageIsMine: senderByConversation.get(String(conversation._id)) === currentUserId,
    })) });
  } catch (error) {
    console.error("List conversations error:", error);
    return res.status(500).json({ message: "Could not load conversations." });
  }
}

async function handleCreateConversation(req, res) {
  const bookingId = String(req.body.bookingId || "");
  if (!mongoose.isValidObjectId(bookingId)) return res.status(400).json({ message: "Choose a valid booking to start a conversation." });
  if (!["client", "provider"].includes(req.user.role)) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found." });
    const participantId = req.user.role === "client" ? booking.clientId : booking.providerId;
    if (String(participantId) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only start conversations for your own bookings." });
    }

    const conversation = await ensureBookingConversation(booking);
    await conversation.populate(conversationPopulate);
    return res.status(200).json({ conversation: serializeConversation(conversation, req.user.role) });
  } catch (error) {
    console.error("Create conversation error:", error);
    return res.status(500).json({ message: "Could not start the conversation." });
  }
}

async function handleListMessages(req, res) {
  const conversationId = String(req.params.conversationId || "");
  const beforeDateValue = String(req.query.before || "");
  const beforeId = String(req.query.beforeId || "");
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (Boolean(beforeDateValue) !== Boolean(beforeId)) return res.status(400).json({ message: "Choose a valid message cursor." });
  const beforeDate = beforeDateValue ? new Date(beforeDateValue) : null;
  if (beforeDate && (Number.isNaN(beforeDate.getTime()) || !mongoose.isValidObjectId(beforeId))) {
    return res.status(400).json({ message: "Choose a valid message cursor." });
  }
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter })
      .select("_id bookingId clientTypingUntil providerTypingUntil");
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    const remoteTypingField = req.user.role === "client" ? "providerTypingUntil" : "clientTypingUntil";
    const remoteTypingUntil = conversation[remoteTypingField];
    const remoteTyping = Boolean(remoteTypingUntil && remoteTypingUntil.getTime() > Date.now());
    const staleTypingFields = ["clientTypingUntil", "providerTypingUntil"]
      .filter((field) => conversation[field] && conversation[field].getTime() <= Date.now());
    await Promise.all(staleTypingFields.map((field) => Conversation.updateOne(
      { _id: conversation._id, [field]: conversation[field] },
      { $unset: { [field]: 1 } },
    )));
    const readAtField = req.user.role === "client" ? "lastReadAtClient" : "lastReadAtProvider";
    const unreadCountField = req.user.role === "client" ? "unreadCountClient" : "unreadCountProvider";
    await Conversation.updateOne({ _id: conversation._id }, { $set: { [readAtField]: new Date(), [unreadCountField]: 0 } });
    const messageFilter = { conversationId: conversation._id };
    if (beforeDate) {
      const beforeObjectId = new mongoose.Types.ObjectId(beforeId);
      messageFilter.$or = mongoose.trusted([
        { createdAt: mongoose.trusted({ $lt: beforeDate }) },
        { createdAt: beforeDate, _id: mongoose.trusted({ $lt: beforeObjectId }) },
      ]);
    }
    const page = await Message.find(mongoose.trusted(messageFilter))
      .select("conversationId sender senderRole text photos eventType eventData createdAt")
      .sort({ createdAt: -1, _id: -1 })
      .limit(MESSAGE_PAGE_SIZE + 1)
      .lean();
    const hasMore = page.length > MESSAGE_PAGE_SIZE;
    const messages = page.slice(0, MESSAGE_PAGE_SIZE).reverse();
    return res.json({
      hasMore,
      remoteTyping,
      remoteTypingUntil: remoteTyping ? remoteTypingUntil.getTime() : null,
      messages: messages.map((message) => serializeMessage(message, req.user._id)),
    });
  } catch (error) {
    console.error("List messages error:", error);
    return res.status(500).json({ message: "Could not load messages." });
  }
}

async function handleCounterOfferTyping(req, res) {
  const conversationId = String(req.params.conversationId || "");
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (!["client", "provider"].includes(req.user.role)) return res.status(403).json({ message: "Messaging is only available to clients and providers." });
  if (typeof req.body?.typing !== "boolean") return res.status(400).json({ message: "Typing state must be true or false." });

  const typingField = req.user.role === "client" ? "clientTypingUntil" : "providerTypingUntil";
  const archivedField = req.user.role === "client" ? "isArchivedByClient" : "isArchivedByProvider";
  const filter = participantFilter(req.user);
  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter })
      .select("_id bookingId isArchivedByClient isArchivedByProvider");
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    if (conversation[archivedField]) return res.status(409).json({ message: "Restore this conversation before updating typing status." });
    if (req.body.typing) {
      const booking = await Booking.findById(conversation.bookingId).select("status counterOffers");
      const hasPendingOffer = booking?.counterOffers?.some((offer) => offer.status === "pending");
      if (booking?.status !== "pending" || hasPendingOffer) {
        return res.status(409).json({ message: "Counter-offer composition is no longer available for this booking." });
      }
      await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { [typingField]: new Date(Date.now() + 8000) } },
      );
    } else {
      await Conversation.updateOne({ _id: conversation._id }, { $unset: { [typingField]: 1 } });
    }
    return res.json({ typing: req.body.typing });
  } catch (error) {
    console.error("Counter-offer typing update error:", error);
    return res.status(500).json({ message: "Could not update typing status." });
  }
}

async function handleUploadChatPhoto(req, res) {
  const conversationId = String(req.body.conversationId || "");
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (!req.file?.buffer?.length) return res.status(400).json({ message: "Choose a photo to upload." });
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter }).select("_id isArchivedByClient isArchivedByProvider");
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    if (req.user.role === "client" ? conversation.isArchivedByClient : conversation.isArchivedByProvider) {
      return res.status(409).json({ message: "Restore this conversation before sending a message." });
    }
    const photo = await uploadChatPhoto(req.file.buffer, conversationId, String(req.user._id));
    return res.status(201).json({ photo });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Upload chat photo error:", error.message);
    return res.status(502).json({ message: "Could not upload this photo. Check the Cloudinary configuration and try again." });
  }
}

async function handleReadChatPhoto(req, res) {
  const conversationId = String(req.params.conversationId || "");
  const messageId = String(req.params.messageId || "");
  const photoIndex = Number(req.params.photoIndex);
  if (!mongoose.isValidObjectId(messageId) || !Number.isInteger(photoIndex) || photoIndex < 0 || photoIndex > 4) {
    return res.status(400).json({ message: "Choose a valid chat photo." });
  }
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter }).select("_id");
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    const message = await Message.findOne({ _id: messageId, conversationId: conversation._id }).select("sender photos");
    const photo = message?.photos?.[photoIndex];
    if (!photo || typeof photo !== "object" || !photo.publicId) return res.status(404).json({ message: "Chat photo not found." });
    const publicId = photo.publicId;
    if (!isOwnedChatPhotoPublicId(publicId, conversationId, String(message.sender))) return res.status(404).json({ message: "Chat photo not found." });

    const image = await fetchAuthenticatedChatPhoto(publicId, photo.format);
    res.set({
      "Cache-Control": "private, no-store",
      "Content-Type": image.contentType,
      "X-Content-Type-Options": "nosniff",
    });
    return res.status(200).send(image.body);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Read chat photo error:", error.message);
    return res.status(502).json({ message: "Could not load this chat photo." });
  }
}

async function handleCleanupChatPhotos(req, res) {
  const conversationId = String(req.body.conversationId || "");
  const publicIds = Array.isArray(req.body.publicIds) ? req.body.publicIds.slice(0, 5) : [];
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter }).select("_id");
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    await Promise.all(publicIds.map(async (publicId) => {
      if (!isOwnedChatPhotoPublicId(publicId, conversationId, String(req.user._id))) return;
      const attached = await Message.exists({ conversationId: conversation._id, "photos.publicId": publicId });
      if (!attached) await deleteChatPhoto(publicId);
    }));
    return res.json({ ok: true });
  } catch (error) {
    console.error("Clean up chat photos error:", error.message);
    return res.status(502).json({ message: "Could not clean up unused chat photos." });
  }
}

async function handleSendMessage(req, res) {
  const conversationId = String(req.body.conversationId || "");
  const text = String(req.body.text || "").trim();
  const photos = req.body.photos === undefined ? [] : req.body.photos;
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (!Array.isArray(photos) || photos.length > 5 || (!text && !photos.length) || text.length > 2000) {
    return res.status(400).json({ message: "Add a message or up to five photos. Messages can contain up to 2,000 characters." });
  }
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter });
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    if (req.user.role === "client" ? conversation.isArchivedByClient : conversation.isArchivedByProvider) {
      return res.status(409).json({ message: "Restore this conversation before sending a message." });
    }
    const verifiedPhotos = await verifyChatPhotoUploads(photos, conversationId, String(req.user._id));
    const message = await Message.create({
      conversationId: conversation._id,
      sender: req.user._id,
      senderRole: req.user.role,
      text,
      photos: verifiedPhotos,
    });
    const recipientUnreadField = req.user.role === "client" ? "unreadCountProvider" : "unreadCountClient";
    await Conversation.updateOne(
      { _id: conversation._id },
      { $set: { lastMessage: text || "Photo attachment", lastMessageAt: message.createdAt }, $inc: { [recipientUnreadField]: 1 } }
    );
    return res.status(201).json({ message: serializeMessage(message, req.user._id), conversation: serializeConversation(await conversation.populate(conversationPopulate), req.user.role) });
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
    console.error("Send message error:", error);
    return res.status(502).json({ message: "Could not send the message. Check the Cloudinary configuration and try again." });
  }
}

async function handleArchiveConversation(req, res) {
  const conversationId = String(req.params.conversationId || "");
  const { action, archived: requestedArchiveState } = req.body;
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (action && action !== "toggle") return res.status(400).json({ message: "Choose a valid archive action." });
  if (action !== "toggle" && typeof requestedArchiveState !== "boolean") return res.status(400).json({ message: "Choose whether to archive or restore this conversation." });
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });
  const archiveField = req.user.role === "client" ? "isArchivedByClient" : "isArchivedByProvider";

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter });
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    conversation[archiveField] = action === "toggle"
      ? !Boolean(conversation[archiveField])
      : requestedArchiveState;
    await conversation.save();
    await conversation.populate(conversationPopulate);
    const updatedConversation = serializeConversation(conversation, req.user.role);
    return res.status(200).json({ success: true, conversation: updatedConversation });
  } catch (error) {
    console.error("Archive conversation error:", error);
    return res.status(500).json({ message: "Could not update the conversation archive." });
  }
}

async function handleReportConversation(req, res) {
  const conversationId = String(req.params.conversationId || "");
  const details = String(req.body.details || "").trim();
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (!details || details.length > 1000) return res.status(400).json({ message: "Add a report description of up to 1,000 characters." });
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter });
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    conversation.supportReports.push({ reportedBy: req.user._id, reporterRole: req.user.role, details, createdAt: new Date(), status: "open" });
    await conversation.save();
    return res.status(201).json({ message: "Support report submitted." });
  } catch (error) {
    console.error("Report conversation error:", error);
    return res.status(500).json({ message: "Could not submit the support report." });
  }
}

async function handleCashConfirmation(req, res) {
  const conversationId = String(req.params.conversationId || "");
  const confirmation = String(req.body.confirmation || "");
  if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ message: "Choose a valid conversation." });
  if (!["cash_paid", "cash_received"].includes(confirmation)) return res.status(400).json({ message: "Choose a valid cash confirmation." });
  const filter = participantFilter(req.user);
  if (!filter) return res.status(403).json({ message: "Messaging is only available to clients and providers." });

  try {
    const conversation = await Conversation.findOne({ _id: conversationId, ...filter }).populate("bookingId");
    if (!conversation) return res.status(403).json({ message: "You are not a participant in this conversation." });
    let booking = conversation.bookingId;
    if (!booking) return res.status(404).json({ message: "The booking for this conversation no longer exists." });
    if (!["complete", "settled"].includes(booking.status)) return res.status(409).json({ message: "Cash payment can only be confirmed after the task is complete." });
    if (booking.paymentMethod !== "cash") return res.status(409).json({ message: "This booking is not configured for cash payment." });
    if ((confirmation === "cash_paid" && req.user.role !== "client") || (confirmation === "cash_received" && req.user.role !== "provider")) {
      return res.status(403).json({ message: "Only the correct booking participant can submit this payment confirmation." });
    }
    if (confirmation === "cash_received" && !booking.cashPaidConfirmedAt) {
      return res.status(409).json({ message: "The client must confirm cash payment first before the provider can confirm receipt." });
    }
    if (confirmation === "cash_paid" && booking.cashReceivedConfirmedAt) {
      return res.status(409).json({ message: "Cash payment is already confirmed by the provider. The booking is waiting for the final receipt step." });
    }
    const timestamp = new Date();
    const confirmationField = confirmation === "cash_paid" ? "cashPaidConfirmedAt" : "cashReceivedConfirmedAt";
    const booleanField = confirmation === "cash_paid" ? "clientConfirmedCash" : "providerConfirmedCash";
    const participantField = req.user.role === "client" ? "clientId" : "providerId";
    const wasAlreadyConfirmed = Boolean(booking[confirmationField]);
    if (!wasAlreadyConfirmed) {
      const confirmedBooking = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          [participantField]: req.user._id,
          status: mongoose.trusted({ $in: ["complete", "settled"] }),
          paymentMethod: "cash",
          [confirmationField]: mongoose.trusted({ $exists: false }),
        },
        { $set: { [confirmationField]: timestamp, [booleanField]: true } },
        { new: true }
      );
      if (!confirmedBooking) return res.status(409).json({ message: "This cash payment confirmation could not be saved. Refresh the booking and try again." });
      booking = confirmedBooking;
    }

    let receiptGenerated = false;
    if (booking.cashPaidConfirmedAt && booking.cashReceivedConfirmedAt && !booking.cashReceipt?.receiptNumber) {
      const receipt = {
        receiptNumber: `TP-${Date.now().toString(36).toUpperCase()}`,
        issuedAt: timestamp,
        serviceDescription: booking.repairDescription,
        totalAmount: calculateTotalPrice(booking.offeredPrice, booking.travelFee || 0, booking.tipAmount || 0),
        paymentMethod: "cash",
        completionNote: booking.completionNote,
        completionPhotos: booking.completionPhotos,
        completionSubmittedAt: booking.completionSubmittedAt,
      };
      const receiptBooking = await Booking.findOneAndUpdate(
        mongoose.trusted({
          _id: booking._id,
          status: mongoose.trusted({ $in: ["complete", "settled"] }),
          cashPaidConfirmedAt: mongoose.trusted({ $exists: true }),
          cashReceivedConfirmedAt: mongoose.trusted({ $exists: true }),
          "cashReceipt.receiptNumber": mongoose.trusted({ $exists: false }),
        }),
        { $set: { cashReceipt: receipt, status: "settled", settledAt: timestamp, clientConfirmedCash: true, providerConfirmedCash: true }, $push: { statusHistory: { status: "settled", at: timestamp } } },
        { new: true }
      );
      if (receiptBooking) {
        booking = receiptBooking;
        receiptGenerated = true;
      } else {
        booking = await Booking.findById(booking._id);
      }
    }

    if (!wasAlreadyConfirmed) {
      const confirmationMessage = confirmation === "cash_paid"
        ? "Client confirmed that cash payment was made."
        : "Provider confirmed that cash payment was received.";
      await appendBookingSystemMessage(booking, confirmationMessage, req.user._id, "payment", { confirmation });
    }
    if (receiptGenerated) {
      await appendBookingSystemMessage(
        booking,
        `Digital Receipt ${booking.cashReceipt.receiptNumber}: ${booking.cashReceipt.serviceDescription} — ${formatAmount(booking.cashReceipt.totalAmount)} paid by cash on completion.`,
        req.user._id,
        "digital_receipt",
        {
          receiptNumber: booking.cashReceipt.receiptNumber,
          totalAmount: booking.cashReceipt.totalAmount,
          paymentMethod: "cash",
          completionNote: booking.cashReceipt.completionNote,
          completionPhotos: booking.cashReceipt.completionPhotos,
          completionSubmittedAt: booking.cashReceipt.completionSubmittedAt,
        }
      );
    }
    conversation.bookingId = booking;
    await conversation.populate(conversationPopulate);
    return res.json({
      conversation: serializeConversation(conversation, req.user.role),
      receiptGenerated,
    });
  } catch (error) {
    console.error("Cash confirmation error:", error);
    return res.status(500).json({ message: "Could not confirm the cash payment." });
  }
}

module.exports = { handleListConversations, handleCreateConversation, handleListMessages, handleCounterOfferTyping, handleUploadChatPhoto, handleReadChatPhoto, handleCleanupChatPhotos, handleSendMessage, handleCashConfirmation, handleArchiveConversation, handleReportConversation };