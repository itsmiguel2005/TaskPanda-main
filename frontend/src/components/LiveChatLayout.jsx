import { apiFetch } from "../services/api.js";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import Header from "./Header.jsx";
import SystemMessageCard from "./SystemMessageCard.jsx";
import StatusChangeConfirmation from "./StatusChangeConfirmation.jsx";
import CompletionProofModal from "./CompletionProofModal.jsx";
import BookingPriceBreakdown from "./BookingPriceBreakdown.jsx";
import MessagePhoto from "./MessagePhoto.jsx";
import { ConversationSkeletonList, MessageSkeletonList } from "./Skeletons.jsx";
import { canRequestCancellation, getCancellationLockMessage } from "../utils/bookingCancellation.js";
import { DEFAULT_ESTIMATED_DURATION_MINUTES } from "../utils/bookingDuration.js";
import UserOnlineStatus, { UserLastActive } from "./UserOnlineStatus.jsx";

const MAX_MESSAGE_INPUT_HEIGHT = 144;
const CONVERSATION_READ_EVENT = "taskpanda:conversation-read";
const CHAT_POLL_VISIBLE_MS = 1200;

function getLocalDateInputValue(date) {
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatConversationTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function groupByDate(messages) {
  const groups = [];
  let currentDate = "";
  let currentGroup = [];
  for (const message of messages) {
    const date = new Date(message.createdAt).toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    if (date !== currentDate) {
      if (currentGroup.length) groups.push({ date: currentDate, messages: currentGroup });
      currentDate = date;
      currentGroup = [message];
    } else {
      currentGroup.push(message);
    }
  }
  if (currentGroup.length) groups.push({ date: currentDate, messages: currentGroup });
  return groups;
}

const STATUS_LABELS = {
  pending: "Pending Request",
  approved: "Confirmed",
  en_route: "On the Way",
  in_progress: "In Progress",
  cancel_requested: "Cancellation Requested",
  canceled: "Cancelled",
  declined: "Declined by Provider",
  complete: "Completed",
  in_revision: "In Revision",
  disputed: "Disputed",
  closed: "Completed",
  settled: "Settled",
};

const STATUS_BADGE_STYLES = {
  pending: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-800",
  en_route: "border-cyan-200 bg-cyan-50 text-cyan-800",
  in_progress: "border-violet-200 bg-violet-50 text-violet-800",
  cancel_requested: "border-amber-200 bg-amber-50 text-amber-800",
  canceled: "border-red-200 bg-red-50 text-red-800",
  declined: "border-rose-200 bg-rose-50 text-rose-800",
  complete: "border-blue-200 bg-blue-50 text-blue-800",
  in_revision: "border-amber-200 bg-amber-50 text-amber-800",
  disputed: "border-red-200 bg-red-50 text-red-800",
  closed: "border-blue-200 bg-blue-50 text-blue-800",
  settled: "border-emerald-200 bg-emerald-50 text-emerald-800",
};

function normalizeBookingStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  return {
    pending: "pending",
    approved: "approved",
    confirmed: "approved",
    "on the way": "en_route",
    en_route: "en_route",
    in_progress: "in_progress",
    "in progress": "in_progress",
    cancel_requested: "cancel_requested",
    canceled: "canceled",
    cancelled: "canceled",
    declined: "declined",
    rejected: "declined",
    "declined by provider": "declined",
    complete: "complete",
    completed: "complete",
    closed: "closed",
    settled: "settled",
    "settled": "settled",
    in_revision: "in_revision",
    "in revision": "in_revision",
    disputed: "disputed",
  }[normalized] || normalized || "pending";
}

function getStatusLabel(status) {
  return STATUS_LABELS[normalizeBookingStatus(status)] || "Pending Request";
}

function getStatusBadgeClass(status) {
  return STATUS_BADGE_STYLES[normalizeBookingStatus(status)] || "border-gray-200 bg-gray-50 text-gray-700";
}

function getInitial(name) {
  return String(name || "?").trim().charAt(0).toUpperCase() || "?";
}

function ConversationAvatar({ conversation, size, showPresence = false }) {
  return (
    <span className={`relative flex ${size} shrink-0 items-center justify-center`}>
      <span className={`flex h-full w-full items-center justify-center overflow-hidden rounded-full ${conversation.profileImage ? "bg-white" : "bg-primary-100 text-primary-700"} text-sm font-bold`}>
        {conversation.profileImage ? (
          <img src={conversation.profileImage} alt={`${conversation.name} profile`} className="h-full w-full object-cover" />
        ) : getInitial(conversation.name)}
      </span>
      {showPresence && <UserOnlineStatus lastActive={conversation.lastActive} isOnline={conversation.isOnline} className="absolute -bottom-0.5 -right-0.5" />}
    </span>
  );
}

function normalizeStarRating(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.min(5, value));
  if (typeof value === "string") {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;
    const directNumber = Number(trimmedValue);
    if (Number.isFinite(directNumber)) return Math.max(0, Math.min(5, directNumber));
    const textMatch = trimmedValue.match(/(\d(?:\.\d)?)\s*(?:\/\s*5|out of 5|stars?)/i);
    if (textMatch) {
      const matchedValue = Number(textMatch[1]);
      if (Number.isFinite(matchedValue)) return Math.max(0, Math.min(5, matchedValue));
    }
  }
  return null;
}

function renderStarRating(rating, className = "text-xs") {
  const normalizedRating = normalizeStarRating(rating);
  const safeRating = normalizedRating != null ? normalizedRating : 0;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`${safeRating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span
          key={star}
          style={{
            color: star <= safeRating ? "#fbbf24" : "#d1d5db",
            lineHeight: 1,
            fontSize: "inherit",
          }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

function isConversationArchivedForRole(conversation, role) {
  if (!conversation) return false;
  const archiveField = role === "client" ? "isArchivedByClient" : "isArchivedByProvider";
  return typeof conversation[archiveField] === "boolean"
    ? conversation[archiveField]
    : Boolean(conversation.isArchived);
}

function isManuallyArchivedForRole(conversation, role) {
  if (!conversation) return false;
  const archiveField = role === "client" ? "isArchivedByClient" : "isArchivedByProvider";
  return typeof conversation[archiveField] === "boolean"
    ? conversation[archiveField]
    : Boolean(conversation.isArchived);
}

function mergeMessages(current, incoming) {
  const merged = new Map(current.map((message) => [message.id, message]));
  incoming.forEach((message) => merged.set(message.id, message));
  if (merged.size === current.length) return current;
  return [...merged.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id));
}

async function uploadChatPhoto(file, conversationId, requestHeaders) {
  const formData = new FormData();
  formData.append("conversationId", conversationId);
  formData.append("photo", file);
  const response = await apiFetch("/api/messages/photos", {
    method: "POST",
    headers: requestHeaders,
    body: formData,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Could not upload this photo.");
  return data.photo;
}

export default function LiveChatLayout({ role, otherRoleLabel }) {
  const navigate = useNavigate();
  const { token, role: authenticatedRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [conversations, setConversations] = useState([]);
  const [selectedId, setSelectedId] = useState(searchParams.get("conversation") || null);
  const [messages, setMessages] = useState([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isLoadingOlderMessages, setIsLoadingOlderMessages] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [archivingConversationIds, setArchivingConversationIds] = useState(() => new Set());
  const [input, setInput] = useState("");
  const [chatPhotos, setChatPhotos] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
  const [actionMessage, setActionMessage] = useState(null);
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");
  const [counterFormOpen, setCounterFormOpen] = useState(false);
  const [counteringOfferId, setCounteringOfferId] = useState("");
  const [counterOfferPrice, setCounterOfferPrice] = useState("");
  const [counterOfferDurationMinutes, setCounterOfferDurationMinutes] = useState(String(DEFAULT_ESTIMATED_DURATION_MINUTES));
  const [counterOfferNote, setCounterOfferNote] = useState("");
  const [remoteCounterTypingUntil, setRemoteCounterTypingUntil] = useState(0);
  const isRemoteTyping = remoteCounterTypingUntil > Date.now();
  const [remoteLastReadAt, setRemoteLastReadAt] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [supportReportOpen, setSupportReportOpen] = useState(false);
  const [supportReportDetails, setSupportReportDetails] = useState("");
  const [reviewedBookingIds, setReviewedBookingIds] = useState(() => {
    try {
      const storedRows = JSON.parse(window.localStorage.getItem("taskpanda-reviewed-bookings") || "{}");
      return storedRows && typeof storedRows === "object" ? storedRows : {};
    } catch {
      return {};
    }
  });
  const [isReviewWidgetOpen, setIsReviewWidgetOpen] = useState(false);
  const [chatReviewRating, setChatReviewRating] = useState(5);
  const [chatReviewText, setChatReviewText] = useState("");
  const [chatReviewPhotos, setChatReviewPhotos] = useState([]);
  const [isSubmittingChatReview, setIsSubmittingChatReview] = useState(false);
  const [revisionRequestOpen, setRevisionRequestOpen] = useState(false);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionPhotos, setRevisionPhotos] = useState([]);
  const [revisionProofOpen, setRevisionProofOpen] = useState(false);
  const [completionProofMode, setCompletionProofMode] = useState("normal");
  const [actionModalView, setActionModalView] = useState("DETAILS");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const olderScrollPositionRef = useRef(null);
  const olderPageMergePendingRef = useRef(false);
  const selectedIdRef = useRef(selectedId);
  const inputRef = useRef(null);
  const chatPhotoInputRef = useRef(null);
  const wasAtBottomRef = useRef(true);
  const previousMessageCountRef = useRef(0);
  const openingBookingRef = useRef("");
  const archivingConversationIdsRef = useRef(new Set());
  const counterTypingActiveRef = useRef(false);
  const counterTypingHeartbeatRef = useRef(null);
  const counterTypingConversationRef = useRef(null);
  const messageTypingIdleRef = useRef(null);
  const messageCursorRef = useRef(null);
  const [openingBooking, setOpeningBooking] = useState(false);

  const requestHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  selectedIdRef.current = selectedId;

  const sendCounterTypingUpdate = useCallback(async (typing, conversationId = selectedIdRef.current, keepalive = false) => {
    if (!conversationId || !token) return;
    try {
      const response = await apiFetch(`/api/conversations/${conversationId}/typing`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ typing }),
        keepalive,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not update counter-offer typing status.");
    } catch (requestError) {
      if (!keepalive) setError(requestError.message || "Could not update counter-offer typing status.");
    }
  }, [requestHeaders, token]);

  const updateCounterOfferTyping = useCallback((isComposing) => {
    if (isComposing) {
      if (!counterTypingActiveRef.current) {
        counterTypingActiveRef.current = true;
        counterTypingConversationRef.current = selectedIdRef.current;
        void sendCounterTypingUpdate(true, counterTypingConversationRef.current);
      }
      if (counterTypingHeartbeatRef.current === null) {
        counterTypingHeartbeatRef.current = window.setInterval(() => {
          if (counterTypingActiveRef.current) void sendCounterTypingUpdate(true, counterTypingConversationRef.current);
        }, 2000);
      }
      return;
    }
    if (counterTypingHeartbeatRef.current !== null) {
      window.clearInterval(counterTypingHeartbeatRef.current);
      counterTypingHeartbeatRef.current = null;
    }
    if (counterTypingActiveRef.current) {
      counterTypingActiveRef.current = false;
      const conversationId = counterTypingConversationRef.current;
      counterTypingConversationRef.current = null;
      void sendCounterTypingUpdate(false, conversationId);
    }
  }, [sendCounterTypingUpdate]);

  const updateMessageTyping = useCallback((value) => {
    if (messageTypingIdleRef.current !== null) {
      window.clearTimeout(messageTypingIdleRef.current);
      messageTypingIdleRef.current = null;
    }
    const isComposing = Boolean(value.trim());
    updateCounterOfferTyping(isComposing);
    if (isComposing) {
      messageTypingIdleRef.current = window.setTimeout(() => {
        messageTypingIdleRef.current = null;
        updateCounterOfferTyping(false);
      }, 1800);
    }
  }, [updateCounterOfferTyping]);

  useEffect(() => () => {
    const conversationId = counterTypingConversationRef.current || selectedIdRef.current;
    if (messageTypingIdleRef.current !== null) window.clearTimeout(messageTypingIdleRef.current);
    if (counterTypingHeartbeatRef.current !== null) window.clearInterval(counterTypingHeartbeatRef.current);
    if (counterTypingActiveRef.current) {
      counterTypingActiveRef.current = false;
      void sendCounterTypingUpdate(false, conversationId, true);
    }
  }, [sendCounterTypingUpdate]);

  useEffect(() => {
    setChatPhotos([]);
  }, [selectedId]);

  useLayoutEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, MAX_MESSAGE_INPUT_HEIGHT)}px`;
    textarea.style.overflowY = contentHeight > MAX_MESSAGE_INPUT_HEIGHT ? "auto" : "hidden";
  }, [input]);

  const loadConversations = useCallback(async () => {
    if (!token || authenticatedRole !== role) return;
    try {
      const params = new URLSearchParams({ includeArchived: String(showArchived) });
      const response = await apiFetch(`/api/conversations?${params.toString()}`, { headers: requestHeaders });
      const data = await response.json().catch(() => ({}));
      console.log("Fetched conversations:", data);
      if (!response.ok) throw new Error(data.message || "Could not load conversations.");
      const payload = Array.isArray(data) ? data : (Array.isArray(data?.conversations) ? data.conversations : []);
      const nextConversations = payload
        .filter((conversation) => conversation && typeof conversation.id === "string")
        .map((conversation) => conversation.id === selectedIdRef.current ? { ...conversation, unreadCount: 0 } : conversation);
      setConversations(nextConversations);
      setError("");
    } catch (requestError) {
      setError((requestError && requestError.name !== "AbortError") ? (requestError.message || "Could not load conversations.") : "");
    } finally {
      setIsLoading(false);
    }
  }, [authenticatedRole, requestHeaders, role, showArchived, token]);

  useEffect(() => {
    loadConversations();
    const intervalId = window.setInterval(() => loadConversations(), 4000);
    return () => window.clearInterval(intervalId);
  }, [loadConversations]);

  useEffect(() => {
    const bookingId = searchParams.get("bookingId");
    if (!bookingId || !token || authenticatedRole !== role || openingBookingRef.current === bookingId) return;
    openingBookingRef.current = bookingId;
    setOpeningBooking(true);
    apiFetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...requestHeaders },
      body: JSON.stringify({ bookingId }),
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not open this booking conversation.");
        const conversation = data.conversation;
        if (!conversation || typeof conversation.id !== "string") throw new Error("Could not load the booking conversation.");
        setConversations((current) => [conversation, ...current.filter((item) => item?.id !== conversation.id)]);
        setSelectedId(conversation.id);
        setSearchParams({ conversation: conversation.id }, { replace: true });
        setError("");
      })
      .catch((requestError) => {
        openingBookingRef.current = "";
        setError(requestError.message || "Could not open this booking conversation.");
      })
      .finally(() => setOpeningBooking(false));
  }, [authenticatedRole, requestHeaders, role, searchParams, setSearchParams, token]);

  useEffect(() => {
    const conversationId = searchParams.get("conversation");
    if (!searchParams.get("bookingId") && conversationId && conversations.some((item) => item.id === conversationId)) {
      setSelectedId(conversationId);
    } else if (!searchParams.get("bookingId") && conversationId && !isLoading) {
      setSelectedId(null);
      setSearchParams({}, { replace: true });
    }
  }, [conversations, isLoading, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectedId || !token || authenticatedRole !== role) {
      setMessages([]);
      messageCursorRef.current = null;
      setRemoteCounterTypingUntil(0);
      setRemoteLastReadAt(null);
      setIsLoadingMessages(false);
      setHasMoreMessages(false);
      return undefined;
    }
    wasAtBottomRef.current = true;
    previousMessageCountRef.current = 0;
    olderScrollPositionRef.current = null;
    olderPageMergePendingRef.current = false;
    setMessages([]);
    setRemoteCounterTypingUntil(0);
    setRemoteLastReadAt(null);
    setIsLoadingMessages(true);
    setIsLoadingOlderMessages(false);
    setHasMoreMessages(false);
    let active = true;
    let initialLoadComplete = false;
    let pollInFlight = false;
    let pollTimeoutId = null;
    const controller = new AbortController();
    const loadMessages = async (signal) => {
      if (!active || pollInFlight || document.visibilityState !== "visible") return;
      pollInFlight = true;
      try {
        const params = new URLSearchParams();
        if (initialLoadComplete && messageCursorRef.current) {
          params.set("after", messageCursorRef.current.createdAt);
          params.set("afterId", messageCursorRef.current.id);
        }
        const query = params.size ? `?${params.toString()}` : "";
        const response = await apiFetch(`/api/messages/${selectedId}${query}`, { headers: requestHeaders, signal });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "Could not load messages.");
        if (active) {
          const nextMessages = Array.isArray(data.messages) ? data.messages : [];
          if (nextMessages.length) {
            const newestMessage = nextMessages[nextMessages.length - 1];
            messageCursorRef.current = { createdAt: newestMessage.createdAt, id: newestMessage.id };
          } else if (!initialLoadComplete) {
            messageCursorRef.current = {
              createdAt: data.serverTime || new Date().toISOString(),
              id: "000000000000000000000000",
            };
          }
          setMessages((current) => mergeMessages(current, nextMessages));
          setRemoteCounterTypingUntil(
            Number(data.remoteTypingRemainingMs) > 0
              ? Date.now() + Number(data.remoteTypingRemainingMs)
              : 0
          );
          setRemoteLastReadAt(data.lastReadAtRemote || null);
          setConversations((current) => current.map((conversation) => conversation.id === selectedId ? { ...conversation, unreadCount: 0 } : conversation));
          setError("");
          if (!initialLoadComplete) {
            initialLoadComplete = true;
            setHasMoreMessages(Boolean(data.hasMore));
            setIsLoadingMessages(false);
            window.dispatchEvent(new CustomEvent(CONVERSATION_READ_EVENT, { detail: { conversationId: selectedId, refresh: true } }));
          }
        }
      } catch (requestError) {
        if (requestError.name !== "AbortError" && active) {
          setError(requestError.message || "Could not load messages.");
          setIsLoadingMessages(false);
        }
      } finally {
        pollInFlight = false;
        if (active && document.visibilityState === "visible") {
          pollTimeoutId = window.setTimeout(() => loadMessages(), CHAT_POLL_VISIBLE_MS);
        }
      }
    };
    loadMessages(controller.signal);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (pollTimeoutId !== null) window.clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
        void loadMessages();
      } else if (pollTimeoutId !== null) {
        window.clearTimeout(pollTimeoutId);
        pollTimeoutId = null;
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      active = false;
      controller.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (pollTimeoutId !== null) window.clearTimeout(pollTimeoutId);
    };
  }, [authenticatedRole, requestHeaders, role, selectedId, token]);

  const selectedConversation = conversations.find((conversation) => conversation?.id === selectedId) || null;
  const lastOwnMessageId = [...messages].reverse().find((message) => message.isMine && message.senderRole !== "system")?.id;
  const hasLastMessageBeenSeen = Boolean(
    remoteLastReadAt
    && lastOwnMessageId
    && messages.some((message) => message.id === lastOwnMessageId && new Date(remoteLastReadAt) >= new Date(message.createdAt))
  );
  useEffect(() => {
    if (!counterFormOpen || !selectedId) updateCounterOfferTyping(false);
  }, [counterFormOpen, selectedId, updateCounterOfferTyping]);

  useEffect(() => {
    if (!remoteCounterTypingUntil) return undefined;
    const remaining = remoteCounterTypingUntil - Date.now();
    if (remaining <= 0) {
      setRemoteCounterTypingUntil(0);
      return undefined;
    }
    const timeout = window.setTimeout(() => setRemoteCounterTypingUntil(0), remaining);
    return () => window.clearTimeout(timeout);
  }, [remoteCounterTypingUntil]);

  const currentBookingIdKey = selectedConversation ? String(selectedConversation.bookingId || "") : "";
  const currentReviewDetails = useMemo(() => {
    if (!selectedConversation) return { hasReview: false, rating: null, review: "", reviewPhotos: [] };
    const fallbackReviewMessage = [...messages]
      .reverse()
      .find((message) => message.eventType === "review" && String(message.eventData?.bookingId || "") === String(selectedConversation.bookingId || "") && message.senderRole === "system");

    const ratingCandidates = [
      selectedConversation.clientRating,
      fallbackReviewMessage?.eventData?.rating,
      fallbackReviewMessage?.text,
    ];

    const resolvedRating = ratingCandidates
      .map((candidate) => normalizeStarRating(candidate))
      .find((candidateValue) => candidateValue != null) ?? null;

    const reviewText = typeof selectedConversation.clientReview === "string" && selectedConversation.clientReview.trim()
      ? selectedConversation.clientReview.trim()
      : (typeof fallbackReviewMessage?.eventData?.review === "string" ? fallbackReviewMessage.eventData.review.trim() : "");
    const reviewPhotos = Array.isArray(selectedConversation.clientReviewPhotos) && selectedConversation.clientReviewPhotos.length > 0
      ? selectedConversation.clientReviewPhotos.filter(Boolean)
      : (Array.isArray(fallbackReviewMessage?.eventData?.reviewPhotos) ? fallbackReviewMessage.eventData.reviewPhotos.filter(Boolean) : []);
    const hasReview = resolvedRating != null || Boolean(reviewText) || reviewPhotos.length > 0 || Boolean(selectedConversation.reviewedAt) || Boolean(fallbackReviewMessage);
    return { hasReview, rating: resolvedRating, review: reviewText, reviewPhotos };
  }, [messages, selectedConversation]);
  const clientRatingValue = normalizeStarRating(currentReviewDetails.rating) ?? 0;
  const safeClientRatingValue = Math.max(0, Math.min(5, clientRatingValue));
  const isBookingReviewedLocally = Boolean(currentBookingIdKey && reviewedBookingIds[currentBookingIdKey]);
  const hasClientRatedCurrentConversation = role === "client" && selectedConversation && ["complete", "closed", "settled"].includes(normalizeBookingStatus(selectedConversation.bookingStatus)) && (currentReviewDetails.hasReview || isBookingReviewedLocally);
  const providerStatusButtons = useMemo(() => {
    if (role !== "provider" || !selectedConversation) return [];
    const status = normalizeBookingStatus(selectedConversation.bookingStatus);
    if (status === "approved") return [{ label: "Mark En Route", status: "en_route" }];
    if (status === "en_route") return [{ label: "Start Task", status: "in_progress" }];
    if (status === "in_progress") return [{ label: "Mark Complete", status: "complete" }];
    return [];
  }, [role, selectedConversation]);

  useEffect(() => {
    try {
      window.localStorage.setItem("taskpanda-reviewed-bookings", JSON.stringify(reviewedBookingIds));
    } catch {
      // Ignore storage failures.
    }
  }, [reviewedBookingIds]);

  useEffect(() => {
    if (!selectedConversation || !currentBookingIdKey) return;
    const bookingId = String(selectedConversation.bookingId || "");
    if (!bookingId) return;
    if (selectedConversation.clientRating != null || currentReviewDetails.hasReview) {
      setReviewedBookingIds((current) => (current[bookingId] ? current : { ...current, [bookingId]: true }));
    }
  }, [currentBookingIdKey, currentReviewDetails.hasReview, selectedConversation]);

  useEffect(() => {
    if (hasClientRatedCurrentConversation) setIsReviewWidgetOpen(false);
  }, [hasClientRatedCurrentConversation]);

  useEffect(() => {
    if (!selectedId || isLoading || selectedConversation) return;
    setSelectedId(null);
    setMessages([]);
    setHasMoreMessages(false);
    setActionMessage(null);
    setActionModalView("DETAILS");
    setActionError("");
    setCounterFormOpen(false);
    setSupportReportOpen(false);
    setSupportReportDetails("");
    setSearchParams({}, { replace: true });
  }, [isLoading, selectedConversation, selectedId, setSearchParams]);

  const isBookingComplete = ["complete", "Completed", "closed", "settled", "Settled"].includes(selectedConversation?.bookingStatus);
  const clientCancellationNeedsReason = Boolean(selectedConversation && Date.now() - new Date(selectedConversation.bookingCreatedAt || 0).getTime() >= 10 * 60 * 1000);
  const revisionRequests = selectedConversation?.revisionRequests || [];
  const latestRevision = revisionRequests[revisionRequests.length - 1] || null;
  const hasUnresolvedRevision = revisionRequests.some((request) => ["open", "accepted"].includes(request.status));
  const canRequestRevision = role === "client"
    && selectedConversation?.bookingStatus === "complete"
    && !selectedConversation.cashReceipt?.receiptNumber
    && !hasUnresolvedRevision
    && revisionRequests.length < 2;
  const revisionLimitReached = role === "client"
    && selectedConversation?.bookingStatus === "complete"
    && !selectedConversation.cashReceipt?.receiptNumber
    && revisionRequests.length >= 2;
  const ownCashConfirmation = role === "client" ? selectedConversation?.cashPaidConfirmedAt : selectedConversation?.cashReceivedConfirmedAt;
  const otherCashConfirmation = role === "client" ? selectedConversation?.cashReceivedConfirmedAt : selectedConversation?.cashPaidConfirmedAt;
  const bookingMutuallySettled = Boolean((selectedConversation?.clientConfirmedCash || selectedConversation?.cashPaidConfirmedAt) && (selectedConversation?.providerConfirmedCash || selectedConversation?.cashReceivedConfirmedAt));
  const showClientRatedSummary = role === "client" && selectedConversation && hasClientRatedCurrentConversation;
  const rateProviderUnlocked = role === "client" && bookingMutuallySettled && !hasClientRatedCurrentConversation;
  const paymentConfirmationLocked = role === "provider" && !otherCashConfirmation;
  const quickReplies = role === "client"
    ? ["Are you on the way?", "Please share your ETA.", "Thank you!"]
    : ["I'm on my way.", "I'm running late and will update you shortly.", "Task completed."];
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    const sorted = conversations
      .filter((conversation) => conversation && isConversationArchivedForRole(conversation, role) === showArchived)
      .sort((a, b) => new Date(b.lastMessageAt || b.updatedAt || 0) - new Date(a.lastMessageAt || a.updatedAt || 0));
    if (!query) return sorted;
    return sorted.filter((conversation) => [conversation.name, conversation.task, conversation.lastMessage]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [conversations, role, search, showArchived]);
  const groupedMessages = useMemo(() => groupByDate(messages), [messages]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const nearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 60;
      wasAtBottomRef.current = nearBottom;
      setShowScrollButton(!nearBottom && messages.length > 6);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [messages.length]);

  useLayoutEffect(() => {
    const previousPosition = olderScrollPositionRef.current;
    const container = messagesContainerRef.current;
    if (!olderPageMergePendingRef.current || !previousPosition || !container) return;
    container.scrollTop = previousPosition.scrollTop + container.scrollHeight - previousPosition.scrollHeight;
    olderScrollPositionRef.current = null;
    olderPageMergePendingRef.current = false;
  }, [messages]);

  useEffect(() => {
    const hasNewMessages = messages.length > previousMessageCountRef.current;
    previousMessageCountRef.current = messages.length;
    if (hasNewMessages && wasAtBottomRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isRemoteTyping && wasAtBottomRef.current) messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [isRemoteTyping]);

  const selectConversation = (conversationId) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    const unreadCount = Math.max(0, Number(conversation?.unreadCount) || 0);
    setConversations((current) => current.map((item) => item.id === conversationId ? { ...item, unreadCount: 0 } : item));
    if (unreadCount > 0) {
      window.dispatchEvent(new CustomEvent(CONVERSATION_READ_EVENT, {
        detail: { conversationId, unreadCount },
      }));
    }
    wasAtBottomRef.current = true;
    setSelectedId(conversationId);
    setActionMessage(null);
    setActionModalView("DETAILS");
    setActionError("");
    setCounterFormOpen(false);
    setSupportReportOpen(false);
    setSupportReportDetails("");
    olderScrollPositionRef.current = null;
    olderPageMergePendingRef.current = false;
    setMessages([]);
    setHasMoreMessages(false);
    setInput("");
    setSearchParams({ conversation: conversationId }, { replace: true });
  };

  const loadOlderMessages = async () => {
    const oldestMessage = messages[0];
    const container = messagesContainerRef.current;
    if (!oldestMessage || !selectedId || !selectedConversation || !hasMoreMessages || isLoadingOlderMessages || !container) return;
    const requestedConversationId = selectedId;
    olderScrollPositionRef.current = { scrollHeight: container.scrollHeight, scrollTop: container.scrollTop };
    setIsLoadingOlderMessages(true);
    try {
      const params = new URLSearchParams({ before: oldestMessage.createdAt, beforeId: oldestMessage.id });
      const response = await apiFetch(`/api/messages/${requestedConversationId}?${params}`, { headers: requestHeaders });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not load older messages.");
      if (selectedIdRef.current !== requestedConversationId) return;
      const olderMessages = Array.isArray(data.messages) ? data.messages : [];
      if (olderMessages.length) {
        olderPageMergePendingRef.current = true;
        setMessages((current) => mergeMessages(current, olderMessages));
      } else {
        olderScrollPositionRef.current = null;
      }
      setHasMoreMessages(Boolean(data.hasMore));
      setError("");
    } catch (requestError) {
      olderScrollPositionRef.current = null;
      olderPageMergePendingRef.current = false;
      if (selectedIdRef.current === requestedConversationId) setError(requestError.message || "Could not load older messages.");
    } finally {
      setIsLoadingOlderMessages(false);
    }
  };

  const handleSend = async () => {
    const text = input.trim();
    if ((!text && !chatPhotos.length) || !selectedId || !selectedConversation || isSending) return;
    updateMessageTyping("");
    setIsSending(true);
    setError("");
    const uploadedPublicIds = [];
    try {
      for (const photo of chatPhotos) {
        const uploadedPhoto = await uploadChatPhoto(photo, selectedId, requestHeaders);
        uploadedPublicIds.push(uploadedPhoto.publicId);
      }
      const response = await apiFetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ conversationId: selectedId, text, photos: uploadedPublicIds.map((publicId) => ({ publicId })) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not send the message.");
      wasAtBottomRef.current = true;
      setMessages((current) => current.some((message) => message.id === data.message.id) ? current : [...current, data.message]);
      setInput("");
      setChatPhotos([]);
      await loadConversations();
    } catch (requestError) {
      if (uploadedPublicIds.length) {
        apiFetch("/api/messages/photos/cleanup", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...requestHeaders },
          body: JSON.stringify({ conversationId: selectedId, publicIds: uploadedPublicIds }),
        }).catch(() => {});
      }
      setError(requestError.message || "Could not send the message.");
    } finally {
      setIsSending(false);
    }
  };

  const handleCashConfirmation = async () => {
    if (!selectedConversation || isConfirmingPayment) return;
    setIsConfirmingPayment(true);
    setError("");
    try {
      const confirmation = role === "client" ? "cash_paid" : "cash_received";
      const response = await apiFetch(`/api/conversations/${selectedConversation.id}/payment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ confirmation }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not confirm the cash payment.");
      if (!data.conversation || typeof data.conversation.id !== "string") throw new Error("Payment was confirmed, but the latest conversation state could not be loaded.");
      setConversations((current) => current
        .filter((conversation) => conversation && typeof conversation.id === "string")
        .map((conversation) => conversation.id === data.conversation.id ? data.conversation : conversation));
      const messagesResponse = await apiFetch(`/api/messages/${selectedConversation.id}`, { headers: requestHeaders });
      const messagesData = await messagesResponse.json().catch(() => ({}));
      if (messagesResponse.ok) setMessages((current) => mergeMessages(current, messagesData.messages || []));
    } catch (requestError) {
      setError(requestError.message || "Could not confirm the cash payment.");
    } finally {
      setIsConfirmingPayment(false);
    }
  };

  const postChatApiAction = async (url, method, body) => {
    setIsActionSubmitting(true);
    setActionError("");
    try {
      const response = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not update this booking.");
      await loadConversations();
      return data;
    } catch (requestError) {
      setActionError(requestError.message || "Could not update this booking.");
      return null;
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleBookingStatusAction = async (status, action) => {
    if (!selectedConversation) throw new Error("Choose a booking first.");
    try {
      const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ status, ...(action ? { action } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not update this booking.");
      if (!data.booking?.id) throw new Error("The server returned an invalid booking response.");
      setConversations((current) => current.map((conversation) => conversation.id === selectedConversation.id ? { ...conversation, bookingStatus: normalizeBookingStatus(data.booking.statusCode || status) } : conversation));
      setActionMessage(null);
      await loadConversations();
    } catch (requestError) {
      throw requestError;
    }
  };

  const handleClientCancelConfirm = async () => {
    if (!selectedConversation || role !== "client" || !canRequestCancellation(selectedConversation)) {
      throw new Error(getCancellationLockMessage(selectedConversation) || "Cancellation is only available while the booking is pending or confirmed.");
    }
    if (clientCancellationNeedsReason && !cancelReason.trim()) throw new Error("Add a brief cancellation reason to continue.");
    const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/cancel`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...requestHeaders },
      body: JSON.stringify({ action: "request", reason: cancelReason.trim() }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not submit the cancellation request.");
    if (!data.booking?.id) throw new Error("The server returned an invalid cancellation response.");
    setActionMessage(null);
    setCancelReason("");
    await loadConversations();
  };

  const submitChatReview = async () => {
    if (!selectedConversation || role !== "client") return;
    setIsSubmittingChatReview(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("rating", String(chatReviewRating));
      formData.append("review", chatReviewText.trim());
      chatReviewPhotos.forEach((photo) => formData.append("photos", photo));
      const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/rate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not save the booking review.");
      if (!data.booking?.id) throw new Error("The server returned an invalid review response.");
      const savedRating = data.booking.clientRating ?? selectedConversation.clientRating ?? null;
      const savedReview = data.booking.clientReview ?? chatReviewText.trim() ?? "";
      const savedReviewPhotos = Array.isArray(data.booking.clientReviewPhotos) && data.booking.clientReviewPhotos.length > 0
        ? data.booking.clientReviewPhotos
        : (Array.isArray(chatReviewPhotos) ? chatReviewPhotos : []);
      setConversations((current) => current.map((conversation) => conversation.id === selectedConversation.id ? {
        ...conversation,
        clientRating: savedRating,
        clientReview: savedReview,
        clientReviewPhotos: savedReviewPhotos,
        reviewedAt: data.booking.reviewedAt ?? new Date().toISOString(),
        bookingStatus: data.booking.statusCode ? normalizeBookingStatus(data.booking.statusCode) : conversation.bookingStatus,
      } : conversation));
      setReviewedBookingIds((current) => ({ ...current, [String(selectedConversation.bookingId)]: true }));
      setChatReviewText("");
      setChatReviewPhotos([]);
      setChatReviewRating(5);
      setIsReviewWidgetOpen(false);
      await loadConversations();
    } catch (requestError) {
      setError(requestError.message || "Could not save the booking review.");
    } finally {
      setIsSubmittingChatReview(false);
    }
  };

  const handleCounterOfferSubmit = async (event) => {
    event.preventDefault();
    if (!selectedConversation) return;
    setActionError("");
    const data = await postChatApiAction(`/api/bookings/${selectedConversation.bookingId}/counter-offers`, "POST", {
      proposedPrice: counterOfferPrice,
      ...(counteringOfferId ? { counterOfferId: counteringOfferId } : {}),
      ...(role === "provider" ? { counterOfferDurationMinutes } : {}),
      note: counterOfferNote,
    });
    if (data) {
      setCounterFormOpen(false);
      setCounteringOfferId("");
      setCounterOfferPrice("");
      setCounterOfferDurationMinutes(String(DEFAULT_ESTIMATED_DURATION_MINUTES));
      setCounterOfferNote("");
      setActionMessage(null);
      try {
        const response = await apiFetch(`/api/messages/${selectedConversation.id}`, { headers: requestHeaders });
        const messagesData = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(messagesData.message || "Could not refresh the negotiation history.");
        wasAtBottomRef.current = true;
        setMessages((current) => mergeMessages(current, messagesData.messages || []));
      } catch (requestError) {
        setError(`Your counter-offer was sent, but the chat could not refresh. ${requestError.message || "Reload the conversation to see it."}`);
      }
    }
  };

  const handleCounterOfferAction = (message) => {
    const event = message?.eventData;
    if (!selectedConversation || !event?.counterOfferId || event.status !== "pending" || event.proposedBy === role) return;
    setActionMessage(message);
    setActionModalView("DETAILS");
    setActionError("");
    setCounteringOfferId(String(event.counterOfferId));
    setCounterOfferPrice(String(event.proposedPrice ?? selectedConversation.offeredPrice ?? ""));
    setCounterOfferDurationMinutes(String(event.counterOfferDurationMinutes ?? selectedConversation.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES));
    setCounterOfferNote("");
    setCounterFormOpen(true);
  };

  const handleCounterOfferResponse = async (counterOfferId, action) => {
    if (!selectedConversation) return;
    const data = await postChatApiAction(`/api/bookings/${selectedConversation.bookingId}/counter-offers/${counterOfferId}`, "PATCH", { action });
    if (!data) return;
    setActionMessage(null);
    try {
      const response = await apiFetch(`/api/messages/${selectedConversation.id}`, { headers: requestHeaders });
      const messagesData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(messagesData.message || "Could not refresh the negotiation history.");
      wasAtBottomRef.current = true;
      setMessages((current) => mergeMessages(current, messagesData.messages || []));
      setError("");
    } catch (requestError) {
      const resolution = action === "accept" ? "accepted" : "declined";
      setError(`Counter-offer ${resolution}, but the chat could not refresh. ${requestError.message || "Reload the conversation to see it."}`);
    }
  };

  const handleBookingRequestAction = (action) => {
    if (!selectedConversation || role !== "provider" || selectedConversation.bookingStatus !== "pending") return;
    setActionMessage({ eventType: "booking_request", eventData: { bookingId: selectedConversation.bookingId } });
    setActionError("");
    setActionModalView(action === "approve" ? "CONFIRM_APPROVE" : action === "decline" ? "CONFIRM_DECLINE" : "DETAILS");
    setCounterFormOpen(action === "counter");
    setCounteringOfferId("");
    if (action === "counter") {
      setCounterOfferPrice("");
      setCounterOfferDurationMinutes(String(selectedConversation.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES));
      setCounterOfferNote("");
    }
  };

  const handleCancellationResponse = async (bookingId, action) => {
    if (!selectedConversation || role !== "provider") return;
    setIsActionSubmitting(true);
    setError("");
    try {
      const response = await apiFetch(`/api/bookings/${bookingId}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not respond to the cancellation request.");
      await loadConversations();
      const messagesResponse = await apiFetch(`/api/messages/${selectedConversation.id}`, { headers: requestHeaders });
      const messagesData = await messagesResponse.json().catch(() => ({}));
      if (!messagesResponse.ok) throw new Error(messagesData.message || "Cancellation updated, but the chat could not be refreshed.");
      setMessages((current) => mergeMessages(current, messagesData.messages || []));
    } catch (requestError) {
      setError(requestError.message || "Could not respond to the cancellation request.");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleSupportReport = async (event) => {
    event.preventDefault();
    if (!selectedConversation) return;
    const data = await postChatApiAction(`/api/conversations/${selectedConversation.id}/report`, "POST", { details: supportReportDetails });
    if (data) {
      setSupportReportDetails("");
      setSupportReportOpen(false);
      setError(data.message || "Support report submitted.");
    }
  };

  const handleRevisionRequest = async (event) => {
    event.preventDefault();
    if (!selectedConversation || !revisionNote.trim()) return;
    const formData = new FormData();
    formData.append("note", revisionNote.trim());
    revisionPhotos.forEach((photo) => formData.append("photos", photo));
    setIsActionSubmitting(true);
    setActionError("");
    try {
      const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/revisions`, {
        method: "POST",
        headers: requestHeaders,
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not submit the revision request.");
      if (!data.booking?.id) throw new Error("The server returned an invalid revision response.");
      await loadConversations();
      setRevisionNote("");
      setRevisionPhotos([]);
      setRevisionRequestOpen(false);
      setError("");
    } catch (requestError) {
      setActionError(requestError.message || "Could not submit the revision request.");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleProviderRevisionResponse = async (action) => {
    if (!selectedConversation || role !== "provider" || !latestRevision) throw new Error("This revision request is no longer available.");
    if (isActionSubmitting) return;
    setIsActionSubmitting(true);
    setActionError("");
    try {
      const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/revisions/${latestRevision.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Could not respond to the revision request.");
      if (!data.booking?.id) throw new Error("The server returned an invalid revision response.");
      await loadConversations();
      if (action === "dispute") setActionMessage(null);
    } catch (requestError) {
      setActionError(requestError.message || "Could not respond to the revision request.");
      throw requestError;
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleCompleteBookingInChat = async (completionNote, photos) => {
    if (!selectedConversation || role !== "provider") throw new Error("Only the provider can mark a task complete.");
    const formData = new FormData();
    formData.append("completionNote", completionNote);
    (photos || []).forEach((photo) => formData.append("photos", photo));
    const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/completion`, {
      method: "POST",
      headers: requestHeaders,
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not submit the completion summary.");
    if (!data.booking?.id) throw new Error("The server returned an invalid completion response.");
    await loadConversations();
    setActionMessage(null);
    setRevisionProofOpen(false);
    setCompletionProofMode("normal");
  };

  const handleRevisionResubmission = async (completionNote, photos) => {
    if (!selectedConversation || role !== "provider") throw new Error("Only the provider can resubmit completed work.");
    const formData = new FormData();
    formData.append("completionNote", completionNote);
    (photos || []).forEach((photo) => formData.append("photos", photo));
    const response = await apiFetch(`/api/bookings/${selectedConversation.bookingId}/completion`, {
      method: "POST",
      headers: requestHeaders,
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Could not resubmit the completed work.");
    if (!data.booking?.id) throw new Error("The server returned an invalid completion response.");
    await loadConversations();
    setActionMessage(null);
    setRevisionProofOpen(false);
    setCompletionProofMode("normal");
  };

  const handleArchiveConversation = async (conversation) => {
    if (archivingConversationIdsRef.current.has(conversation.id)) return;
    const currentArchiveState = isManuallyArchivedForRole(conversation, role);
    const requestedArchiveState = !currentArchiveState;
    const archiveField = role === "client" ? "isArchivedByClient" : "isArchivedByProvider";
    archivingConversationIdsRef.current.add(conversation.id);
    setArchivingConversationIds((current) => new Set(current).add(conversation.id));
    try {
      const response = await apiFetch(`/api/conversations/${conversation.id}/archive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...requestHeaders },
        body: JSON.stringify({ action: "toggle", archived: requestedArchiveState }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        console.warn("Conversation archive toggle failed", {
          conversationId: conversation.id,
          role,
          status: response.status,
          message: data.message || "No error message returned",
        });
        throw new Error(data.message || "Could not update the archive.");
      }
      const returnedConversation = data?.conversation || data?.data?.conversation || data?.data || data;
      const returnedId = returnedConversation?.id || returnedConversation?._id;
      if (returnedId && String(returnedId) !== String(conversation.id)) throw new Error("The archive response did not match this conversation.");
      const roleArchiveState = typeof returnedConversation?.[archiveField] === "boolean"
        ? returnedConversation[archiveField]
        : requestedArchiveState;
      const updatedConversation = {
        ...conversation,
        ...(returnedConversation?.id ? returnedConversation : {}),
        id: String(returnedId || conversation.id),
        [archiveField]: roleArchiveState,
        isArchived: roleArchiveState,
        archivedAt: null,
        isPaymentArchived: false,
      };
      const nextArchivedState = isConversationArchivedForRole(updatedConversation, role);
      console.log("Conversation archive toggle", {
        conversationId: conversation.id,
        role,
        currentArchiveState,
        returnedArchiveState: roleArchiveState,
        resultingArchiveState: nextArchivedState,
      });
      setConversations((current) => current.some((item) => item?.id === conversation.id)
        ? current.map((item) => item?.id === conversation.id ? updatedConversation : item)
        : [updatedConversation, ...current]);
      if (selectedId === conversation.id) {
        setSelectedId(null);
        setActionMessage(null);
        setActionError("");
        setCounterFormOpen(false);
        setSupportReportOpen(false);
        setSupportReportDetails("");
        setRevisionRequestOpen(false);
        setActionModalView("DETAILS");
        setSearchParams({}, { replace: true });
      }
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not update the archive.");
    } finally {
      archivingConversationIdsRef.current.delete(conversation.id);
      setArchivingConversationIds((current) => {
        const next = new Set(current);
        next.delete(conversation.id);
        return next;
      });
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const scrollToBottom = () => {
    wasAtBottomRef.current = true;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-linear-to-b from-sky-50 to-slate-50 pt-16">
      <Header showNav activeTab="Messages" role={role} />
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 overflow-hidden border-y border-sky-100 bg-white shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:my-4 sm:rounded-2xl sm:border">
        <aside className={`flex min-h-0 w-full shrink-0 flex-col border-r border-sky-100 bg-slate-50/70 md:w-80 lg:w-96 ${selectedConversation ? "hidden md:flex" : ""}`}>
          <div className="border-b border-sky-100 bg-white px-5 py-5">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Messages</h1>
            <p className="mt-1 text-xs text-slate-600">Booking conversations</p>
            <div className="mt-3 flex rounded-full bg-slate-100 p-1" role="tablist" aria-label="Conversation folders">
              {[{ archived: false, label: "Active" }, { archived: true, label: "Archived" }].map((folder) => (
                <button key={folder.label} role="tab" aria-selected={showArchived === folder.archived} onClick={() => {
                  setShowArchived(folder.archived);
                  setSelectedId(null);
                  setSearchParams({}, { replace: true });
                }} className={`dashboard-focus flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition ${showArchived === folder.archived ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
                  {folder.label}
                </button>
              ))}
            </div>
            <label className="relative mt-3 block">
              <span className="sr-only">Search conversations</span>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search conversations" className="dashboard-focus w-full rounded-xl border border-sky-100 bg-slate-50 py-2.5 pl-9 pr-4 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20" />
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400"><circle cx="10.8" cy="10.8" r="6.3" /><path strokeLinecap="round" d="m16 16 4.2 4.2" /></svg>
            </label>
          </div>
          {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-3 text-xs text-red-700">{error}</p>}
          <div className="chat-scroll-area min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-2.5">
            {isLoading || openingBooking ? (
              <ConversationSkeletonList label={openingBooking ? "Opening booking conversation" : "Loading conversations"} />
            ) : filteredConversations.length ? filteredConversations.map((conversation) => {
              const latestLoadedMessage = conversation.id === selectedId && messages.length ? messages[messages.length - 1] : null;
              const previewText = latestLoadedMessage?.text || conversation.lastMessage;
              const previewIsMine = latestLoadedMessage ? latestLoadedMessage.isMine : conversation.lastMessageIsMine;
              return (
              <div key={conversation.id} className={`content-arrive mb-1 flex items-center rounded-xl border pr-2 transition-colors ${selectedId === conversation.id ? "border-sky-200 bg-white shadow-[0_6px_18px_rgba(15,23,42,0.06)]" : "border-transparent hover:border-sky-100 hover:bg-white"}`}>
                <button onClick={() => selectConversation(conversation.id)} aria-current={selectedId === conversation.id ? "true" : undefined} className="dashboard-focus flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3.5 text-left">
                  <ConversationAvatar conversation={conversation} size="h-11 w-11" showPresence />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold text-slate-900">{conversation.name}</span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {conversation.unreadCount > 0 && <span aria-label={`${conversation.unreadCount} unread messages`} className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-700 px-1 text-[10px] font-bold text-white shadow-sm">{conversation.unreadCount}</span>}
                        <time className="text-[11px] text-slate-500">{formatConversationTime(conversation.lastMessageAt || conversation.updatedAt)}</time>
                      </span>
                    </span>
                    <span className="block truncate pt-0.5 text-xs font-medium text-slate-600">{conversation.task}</span>
                    <span className={`block truncate pt-0.5 text-xs ${conversation.unreadCount > 0 ? "font-semibold text-slate-800" : "text-slate-500"}`}>{previewIsMine ? "You: " : ""}{previewText}</span>
                  </span>
                </button>
                <button type="button" onClick={() => handleArchiveConversation(conversation)} disabled={archivingConversationIds.has(conversation.id)} aria-busy={archivingConversationIds.has(conversation.id)} aria-label={isManuallyArchivedForRole(conversation, role) ? "Restore conversation" : "Archive conversation"} title={archivingConversationIds.has(conversation.id) ? "Updating archive…" : isManuallyArchivedForRole(conversation, role) ? "Restore conversation" : "Archive conversation"} className="dashboard-focus shrink-0 rounded-lg p-2 text-slate-500 hover:bg-white hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="h-4 w-4" aria-hidden="true">
                    {isManuallyArchivedForRole(conversation, role) ? <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M5 7.5v11h14v-11M9 11h6m-3-7v9m-3-3 3 3 3-3" /> : <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M5 7.5v11h14v-11M9 11h6M4 4h16v3.5H4z" />}
                  </svg>
                </button>
              </div>
              );
            }) : (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <p className="text-sm font-semibold text-gray-700">{search ? "No matching conversations" : "No booking conversations yet"}</p>
                <p className="mt-1 text-xs text-gray-500">Open Chat from a booking to start a conversation.</p>
              </div>
            )}
          </div>
        </aside>

        <main className={`relative min-h-0 min-w-0 flex-1 flex-col bg-white ${selectedConversation ? "flex" : "hidden md:flex"}`}>
          {selectedConversation ? (
            <>
              <header className="flex flex-wrap items-center gap-2.5 border-b border-sky-100 bg-white px-3 py-3 sm:flex-nowrap sm:gap-3 sm:px-5 sm:py-4">
                <button onClick={() => { setSelectedId(null); setSearchParams({}, { replace: true }); }} className="dashboard-focus mr-0.5 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Back to conversations">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="m15 18-6-6 6-6" /></svg>
                </button>
                <ConversationAvatar conversation={selectedConversation} size="h-10 w-10 ring-2 ring-sky-100" showPresence />
                <span className="min-w-0 flex-1">
                  <span className="block max-w-50 truncate text-sm font-bold text-slate-900">{selectedConversation.name}</span>
                  <span className="block max-w-50 truncate text-xs text-slate-600">{role === "client" ? selectedConversation.cred : otherRoleLabel}</span>
                  <UserLastActive lastActive={selectedConversation.lastActive} lastOfflineAt={selectedConversation.lastOfflineAt} isOnline={selectedConversation.isOnline} />
                </span>
                <span className="hidden max-w-45 truncate text-right text-xs text-slate-600 lg:block">{selectedConversation.task}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold ${getStatusBadgeClass(selectedConversation.bookingStatus)}`}>
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                  {getStatusLabel(selectedConversation.bookingStatus)}
                </span>
                {role === "client" && !bookingMutuallySettled && selectedConversation && ["complete", "closed", "settled"].includes(normalizeBookingStatus(selectedConversation.bookingStatus)) && (
                  <span className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-semibold text-amber-900">
                    Settlement pending
                  </span>
                )}
                <button type="button" onClick={() => { setSupportReportDetails(""); setSupportReportOpen(true); }} className="dashboard-focus ml-auto rounded-xl border border-sky-100 px-3 py-2 text-xs font-semibold text-sky-900 transition hover:border-sky-200 hover:bg-sky-50 sm:ml-0">{selectedConversation.bookingStatus === "closed" ? "Report post-service issue" : "Report issue"}</button>
              </header>
              {role === "client" && ["complete", "closed", "settled"].includes(normalizeBookingStatus(selectedConversation.bookingStatus)) && !hasClientRatedCurrentConversation && bookingMutuallySettled && (
                <section className="border-b border-gray-100 bg-amber-50/60 px-4 py-3 sm:px-5">
                  {!hasClientRatedCurrentConversation ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-amber-900">How was the service?</p>
                          <p className="text-xs text-amber-800">Share a quick rating for {selectedConversation.name}.</p>
                        </div>
                        <button type="button" onClick={() => setIsReviewWidgetOpen((open) => !open)} disabled={hasClientRatedCurrentConversation} className="rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60">
                          {isReviewWidgetOpen ? "Hide form" : (rateProviderUnlocked ? "Rate Provider" : "Already Rated")}
                        </button>
                      </div>
                      {isReviewWidgetOpen && rateProviderUnlocked && (
                        <div className="rounded-xl border border-amber-200 bg-white p-3">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button key={star} type="button" onClick={() => setChatReviewRating(star)} className="text-xl leading-none transition hover:scale-110" aria-label={`Rate ${star} out of 5`}>
                                <span className={star <= chatReviewRating ? "text-amber-500" : "text-gray-300"}>★</span>
                              </button>
                            ))}
                          </div>
                          <textarea value={chatReviewText} onChange={(event) => setChatReviewText(event.target.value)} maxLength={1000} rows={3} placeholder="Optional feedback about the service" className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20" />
                          <label className="mt-3 block text-xs font-medium text-gray-700">Photos (up to 5)
                            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onChange={(event) => setChatReviewPhotos(Array.from(event.target.files || []).slice(0, 5))} className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-semibold" />
                          </label>
                          {chatReviewPhotos.length > 0 && <p className="mt-1 text-[11px] text-gray-500">{chatReviewPhotos.length} photo{chatReviewPhotos.length === 1 ? "" : "s"} selected.</p>}
                          <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => { setIsReviewWidgetOpen(false); setChatReviewText(""); setChatReviewPhotos([]); setChatReviewRating(5); }} className="flex-1 rounded-lg border border-gray-200 py-2 text-sm font-semibold text-gray-700">Cancel</button>
                            <button type="button" disabled={isSubmittingChatReview} onClick={submitChatReview} className="flex-1 rounded-lg bg-primary-600 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{isSubmittingChatReview ? "Submitting…" : "Submit review"}</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}
                </section>
              )}
              {showClientRatedSummary && (
                <section className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-emerald-900">Your booking rating</p>
                      <p className="mt-0.5 text-xs text-emerald-800">
                        <span className="inline-flex items-center gap-1">{renderStarRating(safeClientRatingValue, "text-[11px]")}</span>
                        {currentReviewDetails.review ? ` · ${currentReviewDetails.review}` : ""}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-800">Rated</span>
                  </div>
                  {selectedConversation.clientReviewPhotos?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedConversation.clientReviewPhotos.map((photo) => <MessagePhoto key={photo} photo={photo} requestHeaders={requestHeaders} alt="Review attachment" imageClassName="h-12 w-12 rounded object-cover" />)}
                    </div>
                  )}
                </section>
              )}
              <section className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 bg-white px-3 py-2.5 shadow-[0_4px_12px_rgba(15,23,42,0.035)] sm:px-5">
                <button type="button" onClick={() => { setActionModalView("DETAILS"); setActionMessage({ eventType: "booking_request", eventData: { bookingId: selectedConversation.bookingId } }); setActionError(""); }} className="dashboard-focus min-w-0 flex-1 rounded-xl px-2 py-1 text-left transition hover:bg-sky-50 sm:max-w-[55%]">
                  <p className="truncate text-xs font-bold text-slate-900">{selectedConversation.task}</p>
                  <p className="truncate text-[11px] text-slate-600">Total due: ₱{Number(selectedConversation.totalPrice || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })} · Task ₱{Number(selectedConversation.offeredPrice || 0).toLocaleString("en-PH")} · Travel ₱{Number(selectedConversation.travelFee || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}</p>
                  <span className="text-[10px] font-bold text-blue-800">View request summary</span>
                </button>
                {role === "provider" && providerStatusButtons.length > 0 && (
                  <div className="flex flex-wrap justify-end gap-2">
                    {providerStatusButtons.map((statusButton) => (
                      <button key={statusButton.status} type="button" onClick={() => {
                        const nextStatus = statusButton.status;
                        setActionError("");
                        setActionMessage({ eventType: "booking_status", eventData: { status: nextStatus } });
                        setActionModalView("CONFIRM_STATUS_CHANGE");
                      }} className="dashboard-primary-button dashboard-focus min-h-9 px-3 py-1.5 text-[10px]">
                        {statusButton.label}
                      </button>
                    ))}
                  </div>
                )}
                <span className="w-full rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-medium leading-relaxed text-amber-900 sm:w-auto sm:max-w-xs">Safety: verify the provider and agree on the work. Pay cash only after satisfactory completion.</span>
              </section>
              {isBookingComplete && selectedConversation.paymentMethod === "cash" && (
                <section className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-3 sm:px-5">
                  {selectedConversation.cashReceipt?.receiptNumber ? (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-emerald-950">
                      <div>
                        <p className="font-bold">Digital Receipt · {selectedConversation.cashReceipt.receiptNumber}</p>
                        <p className="mt-0.5">{selectedConversation.cashReceipt.serviceDescription} · ₱{Number(selectedConversation.cashReceipt.totalAmount || 0).toLocaleString("en-PH")} · Cash on Completion</p>
                        <p className="mt-0.5 text-emerald-800">Paid and received by both parties on {new Date(selectedConversation.cashReceipt.issuedAt).toLocaleString()}.</p>
                        {(selectedConversation.cashReceipt.completionNote || selectedConversation.completionNote) && <p className="mt-2 font-medium">Work completed: {selectedConversation.cashReceipt.completionNote || selectedConversation.completionNote}</p>}
                        {(selectedConversation.cashReceipt.completionSubmittedAt || selectedConversation.completionSubmittedAt) && <p className="mt-1 text-emerald-800">Proof submitted {new Date(selectedConversation.cashReceipt.completionSubmittedAt || selectedConversation.completionSubmittedAt).toLocaleString()}.</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(selectedConversation.cashReceipt.completionPhotos?.length ? selectedConversation.cashReceipt.completionPhotos : selectedConversation.completionPhotos || []).map((photo) => <MessagePhoto key={photo} photo={photo} requestHeaders={requestHeaders} alt="Provider completion proof" imageClassName="h-16 w-16 rounded-md border border-emerald-200 object-cover" />)}
                        </div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold">Receipt issued</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-xs text-emerald-950">
                        <p className="font-semibold">Cash on Completion · ₱{Number(selectedConversation.totalPrice || 0).toLocaleString("en-PH", { maximumFractionDigits: 2 })}</p>
                        <p className="mt-0.5">
                          {role === "client"
                            ? (ownCashConfirmation ? "Your confirmation is saved." : "Confirm once you have paid the provider.")
                            : (ownCashConfirmation ? "Your confirmation is saved." : "Waiting for the client to confirm cash payment first.")}
                          {otherCashConfirmation ? " The other party has confirmed." : (role === "client" ? " Waiting for the provider's confirmation." : " Waiting for the client's confirmation.")}
                        </p>
                        {selectedConversation.completionNote && <p className="mt-2 font-medium">Work completed: {selectedConversation.completionNote}</p>}
                        {selectedConversation.completionSubmittedAt && <p className="mt-1 text-emerald-800">Proof submitted {new Date(selectedConversation.completionSubmittedAt).toLocaleString()}.</p>}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(selectedConversation.completionPhotos || []).map((photo) => <MessagePhoto key={photo} photo={photo} requestHeaders={requestHeaders} alt="Provider completion proof" imageClassName="h-16 w-16 rounded-md border border-emerald-200 object-cover" />)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleCashConfirmation}
                        disabled={Boolean(ownCashConfirmation) || isConfirmingPayment || (role === "provider" && !otherCashConfirmation)}
                        className="rounded-md bg-emerald-700 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {role === "client"
                          ? (ownCashConfirmation ? "Cash Paid Confirmed" : isConfirmingPayment ? "Saving…" : "Confirm Cash Paid")
                          : ownCashConfirmation
                            ? "Cash Received Confirmed"
                            : paymentConfirmationLocked
                              ? "Waiting for client confirmation"
                              : isConfirmingPayment
                                ? "Saving…"
                                : "Confirm Cash Received"}
                      </button>
                    </div>
                  )}
                  {canRequestRevision && <button type="button" onClick={() => setRevisionRequestOpen(true)} className="mt-3 rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100">Request revision</button>}
                  {revisionLimitReached && <p className="mt-3 w-full rounded-md bg-amber-100 px-3 py-2 text-xs font-medium text-amber-900">Two revision cycles have been used. Continue the discussion in chat or report the issue to support.</p>}
                </section>
              )}
              {role === "client" && selectedConversation.bookingStatus === "in_revision" && (
                <p className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-950 sm:px-5">
                  {latestRevision?.status === "accepted" ? "The provider accepted your revision and is updating the work." : "Revision request sent. Waiting for the provider to respond."}
                  {latestRevision?.note && <span className="mt-1 block font-normal">Requested: {latestRevision.note}</span>}
                </p>
              )}
              {role === "client" && selectedConversation.bookingStatus === "disputed" && (
                <p className="border-b border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-900 sm:px-5">The provider disputed this revision. It has been escalated for manual review. <button type="button" onClick={() => { setSupportReportDetails(""); setSupportReportOpen(true); }} className="ml-1 underline">Contact support</button></p>
              )}
              {error && <p role="alert" className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
              <div ref={messagesContainerRef} className="chat-scroll-area min-h-0 flex-1 space-y-1 overflow-y-auto bg-linear-to-b from-slate-50/90 to-white px-3 py-4 sm:px-6 sm:py-5">
                {isLoadingMessages ? (
                  <MessageSkeletonList />
                ) : (
                  <>
                {hasMoreMessages && <div className="flex justify-center py-2"><button type="button" disabled={isLoadingOlderMessages} onClick={loadOlderMessages} className="dashboard-focus rounded-xl border border-sky-100 bg-white px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50">{isLoadingOlderMessages ? "Loading older messages…" : "Load older messages"}</button></div>}
                {groupedMessages.length ? groupedMessages.map((group) => (
                  <section key={group.date} className="content-arrive">
                    <div className="flex justify-center py-4"><span className="rounded-full border border-sky-100 bg-white px-3 py-1.5 text-[10px] font-bold tracking-wide text-slate-600 shadow-sm">{group.date}</span></div>
                    <div className="space-y-3">
                      {group.messages.map((message) => message.senderRole === "system" ? (
                        <div key={message.id} className={`flex py-1 ${message.isMine ? "justify-end" : "justify-start"}`}>
                          <SystemMessageCard
                            message={message}
                            role={role}
                            actorName={message.isMine ? "You" : selectedConversation.name}
                            bookingPricing={selectedConversation}
                            onOpen={(event) => { setActionModalView("DETAILS"); setActionMessage(event); setActionError(""); setCounterFormOpen(false); }}
                            onRespondToOffer={handleCounterOfferResponse}
                            onCounterOffer={handleCounterOfferAction}
                            onRespondToCancellation={handleCancellationResponse}
                            onBookingRequestAction={handleBookingRequestAction}
                            isBookingRequestPending={selectedConversation.bookingStatus === "pending" && !selectedConversation.pendingCounterOffer}
                            isCancellationPending={normalizeBookingStatus(selectedConversation.bookingStatus) === "cancel_requested"}
                            isActionSubmitting={isActionSubmitting}
                            requestHeaders={requestHeaders}
                          />
                        </div>
                      ) : (
                        <div key={message.id} className={`flex items-end gap-2 ${message.isMine ? "justify-end" : "justify-start"}`}>
                          {!message.isMine && <ConversationAvatar conversation={selectedConversation} size="h-7 w-7 ring-1 ring-sky-100" />}
                          <div className={`max-w-[88%] rounded-2xl border px-3.5 py-2.5 text-[13px] leading-relaxed shadow-[0_4px_14px_rgba(15,23,42,0.045)] sm:max-w-[78%] sm:px-4 ${message.isMine ? "rounded-br-md border-slate-900 bg-slate-900 text-white" : "rounded-bl-md border-sky-100 bg-white text-slate-800"}`}>
                            {message.text && <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>}
                            {message.photos?.length > 0 && (
                              <div className={`flex flex-wrap gap-2 ${message.text ? "mt-2" : ""}`}>
                                {message.photos.map((photo) => <MessagePhoto key={photo} photo={photo} requestHeaders={requestHeaders} alt="Chat photo" />)}
                              </div>
                            )}
                            <time className={`mt-1 block text-right text-[10px] ${message.isMine ? "text-slate-300" : "text-slate-500"}`} dateTime={message.createdAt}>{formatConversationTime(message.createdAt)}</time>
                            {message.id === lastOwnMessageId && hasLastMessageBeenSeen && (
                              <span className="mt-0.5 block text-right text-[10px] font-medium text-sky-600" aria-label={`${selectedConversation.name} has seen your message`}>Seen</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )) : <p className="py-10 text-center text-sm text-slate-600">No messages yet. Send the first message about this booking.</p>}
                {isRemoteTyping && (
                  <div role="status" aria-live="polite" aria-label={`${selectedConversation.name} is typing`} className="flex items-end gap-2 py-1">
                    <ConversationAvatar conversation={selectedConversation} size="h-7 w-7 ring-1 ring-sky-100" />
                    <span className="inline-flex h-9 items-center gap-1 rounded-2xl rounded-bl-md border border-sky-100 bg-white px-3.5 shadow-[0_4px_14px_rgba(15,23,42,0.045)]" aria-hidden="true">
                      <span className="counter-typing-dot h-1.5 w-1.5 rounded-full bg-blue-600" />
                      <span className="counter-typing-dot h-1.5 w-1.5 rounded-full bg-blue-600" />
                      <span className="counter-typing-dot h-1.5 w-1.5 rounded-full bg-blue-600" />
                    </span>
                  </div>
                )}
                  </>
                )}
                <div ref={messagesEndRef} className="h-1" />
              </div>
              {showScrollButton && <button onClick={scrollToBottom} className="dashboard-focus absolute bottom-20 right-6 z-10 rounded-full border border-sky-100 bg-white p-2.5 text-sky-900 shadow-[0_6px_18px_rgba(15,23,42,0.12)] transition hover:bg-sky-50" aria-label="Scroll to latest message"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" /></svg></button>}
              {isManuallyArchivedForRole(selectedConversation, role) ? (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-4 text-center text-xs text-gray-500">Restore this conversation from Archived to send messages. The digital receipt remains available above.</div>
              ) : (
                <div className="border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
                  {chatPhotos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2" aria-label="Selected photos">
                      {chatPhotos.map((photo, index) => (
                        <span key={`${photo.name}-${photo.lastModified}`} className="inline-flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                          <span className="max-w-40 truncate">{photo.name}</span>
                          <button type="button" onClick={() => setChatPhotos((current) => current.filter((_, photoIndex) => photoIndex !== index))} aria-label={`Remove ${photo.name}`} className="text-slate-500 hover:text-red-600">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {quickReplies.map((reply) => <button key={reply} type="button" onClick={() => { setInput(reply); updateMessageTyping(reply); }} className="dashboard-focus min-h-8 rounded-full border border-sky-100 bg-white px-3 py-1.5 text-[10px] font-semibold text-sky-900 transition hover:border-sky-200 hover:bg-sky-50">{reply}</button>)}
                  </div>
                  <form onSubmit={(event) => { event.preventDefault(); updateMessageTyping(""); handleSend(); }} className="flex items-end gap-2 rounded-2xl border border-sky-100 bg-slate-50 p-2">
                    <input ref={chatPhotoInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple className="sr-only" onChange={(event) => {
                      const pickedPhotos = Array.from(event.target.files || []);
                      event.target.value = "";
                      if (pickedPhotos.some((photo) => photo.size > 4 * 1024 * 1024)) {
                        setError("Each photo must be 4 MB or smaller.");
                        return;
                      }
                      if (pickedPhotos.length > 5 - chatPhotos.length) setError("You can attach up to five photos per message.");
                      else setError("");
                      setChatPhotos((current) => [...current, ...pickedPhotos].slice(0, 5));
                    }} />
                    <button type="button" onClick={() => chatPhotoInputRef.current?.click()} disabled={isSending || chatPhotos.length >= 5} title="Attach photos" aria-label="Attach photos" className="dashboard-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-sky-100 bg-white text-sky-900 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true"><path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5" /></svg>
                    </button>
                    <textarea ref={inputRef} value={input} onChange={(event) => { setInput(event.target.value); updateMessageTyping(event.target.value); }} onBlur={() => updateMessageTyping("")} onKeyDown={handleKeyDown} rows={1} maxLength={2000} placeholder={`Message ${selectedConversation.name}…`} className="dashboard-focus min-h-11 max-h-36 flex-1 resize-none overflow-y-hidden rounded-xl border border-sky-100 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20" />
                    <button type="submit" disabled={(!input.trim() && !chatPhotos.length) || isSending} className="dashboard-primary-button dashboard-focus flex h-11 shrink-0 items-center justify-center px-4 text-sm disabled:cursor-not-allowed disabled:opacity-40">{isSending ? "Sending…" : "Send"}</button>
                  </form>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <h2 className="text-lg font-bold text-gray-900">Select a conversation</h2>
              <p className="mt-2 max-w-xs text-sm text-gray-500">Choose a booking conversation to message your {otherRoleLabel.toLowerCase()}.</p>
            </div>
          )}
        </main>
        {actionMessage && selectedConversation && (
          <div className="fixed inset-0 z-80 flex items-center justify-center bg-black/50 p-4" onClick={() => {
            if (actionModalView !== "DETAILS") {
              setActionModalView("DETAILS");
              return;
            }
            setActionMessage(null);
            setActionError("");
            setCounterFormOpen(false);
          }}>
            <section role="dialog" aria-modal="true" aria-labelledby={actionModalView === "DETAILS" ? "booking-action-title" : "status-change-title"} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-100 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]" onClick={(event) => event.stopPropagation()}>
              {actionModalView === "CONFIRM_DISPUTE" ? (
                <StatusChangeConfirmation
                  key={`${selectedConversation.id}-revision-dispute`}
                  embedded
                  nextStatus="Disputed"
                  onConfirm={async () => {
                    await handleProviderRevisionResponse("dispute");
                    setActionMessage(null);
                  }}
                  onClose={() => setActionModalView("DETAILS")}
                />
              ) : actionModalView === "CONFIRM_STATUS_CHANGE" && (actionMessage?.eventData?.status || selectedConversation.bookingStatus) === "complete" ? (
                <CompletionProofModal
                  bookingName={selectedConversation.name}
                  onSubmit={handleCompleteBookingInChat}
                  onClose={() => {
                    setActionMessage(null);
                    setActionModalView("DETAILS");
                    setCompletionProofMode("normal");
                  }}
                />
              ) : actionModalView === "CONFIRM_STATUS_CHANGE" ? (
                <StatusChangeConfirmation
                  key={`${selectedConversation.id}-status-${actionMessage?.eventData?.status || "update"}`}
                  embedded
                  nextStatus={getStatusLabel(actionMessage?.eventData?.status || selectedConversation.bookingStatus)}
                  onConfirm={async () => {
                    const nextStatus = actionMessage?.eventData?.status || selectedConversation.bookingStatus;
                    await handleBookingStatusAction(nextStatus);
                    setActionMessage(null);
                    setActionModalView("DETAILS");
                  }}
                  onClose={() => {
                    setActionMessage(null);
                    setActionModalView("DETAILS");
                  }}
                />
              ) : actionModalView === "CONFIRM_DECLINE" ? (
                <StatusChangeConfirmation
                  key={`${selectedConversation.id}-decline`}
                  embedded
                  nextStatus="Declined by Provider"
                  onConfirm={() => {
                    if (role !== "provider" || selectedConversation.bookingStatus !== "pending") throw new Error("This booking request is no longer available to decline.");
                    return handleBookingStatusAction("declined");
                  }}
                  onClose={() => {
                    setActionMessage(null);
                    setActionModalView("DETAILS");
                    setActionError("");
                    setCounterFormOpen(false);
                  }}
                />
              ) : actionModalView === "CONFIRM_APPROVE" ? (
                <StatusChangeConfirmation
                  key={`${selectedConversation.id}-approve`}
                  embedded
                  nextStatus="Approved"
                  onConfirm={() => {
                    if (role !== "provider" || selectedConversation.bookingStatus !== "pending") throw new Error("This booking request is no longer available to approve.");
                    return handleBookingStatusAction("approved");
                  }}
                  onClose={() => {
                    setActionMessage(null);
                    setActionModalView("DETAILS");
                    setActionError("");
                    setCounterFormOpen(false);
                  }}
                />
              ) : actionModalView === "CONFIRM_CANCEL" ? (
                <StatusChangeConfirmation
                  key={`${selectedConversation.id}-client-cancel`}
                  embedded
                  nextStatus="Cancelled"
                  canConfirm={!clientCancellationNeedsReason || Boolean(cancelReason.trim())}
                  onConfirm={handleClientCancelConfirm}
                  onClose={() => setActionModalView("DETAILS")}
                >
                  <p className="mt-2 text-sm text-gray-600">{selectedConversation.task}</p>
                  {clientCancellationNeedsReason && (
                    <label htmlFor="chat-cancellation-reason" className="mt-4 block text-sm font-medium text-gray-700">Brief cancellation reason
                      <textarea id="chat-cancellation-reason" required maxLength={500} rows={3} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Tell the provider why you need to cancel" className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    </label>
                  )}
                </StatusChangeConfirmation>
              ) : (
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 id="booking-action-title" className="text-lg font-bold text-gray-900">Booking details & actions</h2>
                    <p className="mt-1 text-sm text-gray-500">{selectedConversation.task}</p>
                  </div>
                  <button type="button" onClick={() => { setActionMessage(null); setActionModalView("DETAILS"); setActionError(""); setCounterFormOpen(false); }} className="dashboard-focus rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900" aria-label="Close booking actions">×</button>
                </div>
                <BookingPriceBreakdown booking={selectedConversation} className="mt-4" />
                <dl className="mt-3 grid grid-cols-1 gap-3 rounded-xl border border-sky-100 bg-white p-4 text-sm sm:grid-cols-2">
                  <div><dt className="dashboard-kicker">Booking status</dt><dd className="mt-1 font-semibold text-slate-900">{getStatusLabel(selectedConversation.bookingStatus)}</dd></div>
                  <div><dt className="dashboard-kicker">Appointment</dt><dd className="mt-1 font-semibold text-slate-900">{selectedConversation.serviceDate ? new Date(selectedConversation.serviceDate).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" }) : "Date pending"} {selectedConversation.timeSlot}</dd></div>
                  <div><dt className="dashboard-kicker">Payment</dt><dd className="mt-1 font-semibold text-slate-900">Cash on Completion</dd></div>
                </dl>
                {role === "provider" && selectedConversation.bookingStatus === "in_revision" && latestRevision && (
                  <section className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                    <p className="font-semibold">Revision request · Cycle {revisionRequests.length} of 2</p>
                    <p className="mt-1 whitespace-pre-wrap">{latestRevision.note}</p>
                    {latestRevision.responseNote && <p className="mt-1 text-xs">Your response: {latestRevision.responseNote}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">{(latestRevision.photos || []).map((photo) => <MessagePhoto key={photo} photo={photo} requestHeaders={requestHeaders} alt="Client issue photo" imageClassName="h-16 w-16 rounded border border-amber-200 object-cover" />)}</div>
                    {latestRevision.status === "open" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" disabled={isActionSubmitting} onClick={() => handleProviderRevisionResponse("accept").catch((requestError) => setActionError(requestError.message))} className="rounded-md bg-primary-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Accept &amp; fix</button>
                        <button type="button" disabled={isActionSubmitting} onClick={() => { setActionError(""); setActionModalView("CONFIRM_DISPUTE"); }} className="rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-800 disabled:opacity-50">Dispute revision</button>
                      </div>
                    )}
                    {latestRevision.status === "accepted" && <button type="button" onClick={() => { setCompletionProofMode("revision"); setRevisionProofOpen(true); }} className="mt-3 rounded-md bg-primary-700 px-3 py-2 text-xs font-semibold text-white">Resubmit work</button>}
                    {actionError && <p role="alert" className="mt-2 text-xs text-red-800">{actionError}</p>}
                  </section>
                )}
                {role === "client" && selectedConversation.bookingStatus === "disputed" && <p className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-900">This revision is under dispute and has been escalated for manual review.</p>}
                {actionMessage.eventType === "counter_offer" && actionMessage.eventData && (
                  <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/70 p-3.5 text-sm text-slate-900">
                    <p className="font-semibold">Counter-offer from {actionMessage.eventData.proposedBy === role ? "you" : selectedConversation.name}</p>
                    <BookingPriceBreakdown
                      booking={{
                        ...selectedConversation,
                        offeredPrice: actionMessage.eventData.proposedPrice,
                        estimatedDurationMinutes: actionMessage.eventData.counterOfferDurationMinutes ?? selectedConversation.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
                        totalPrice: Number(actionMessage.eventData.proposedPrice || 0) + Number(selectedConversation.travelFee || 0) + Number(selectedConversation.tipAmount || 0),
                      }}
                      className="mt-3 bg-white"
                      taskLabel="Proposed task price"
                      totalLabel="Estimated total"
                    />
                    {actionMessage.eventData.note && <p className="mt-3 border-t border-sky-100 pt-2 text-sm leading-relaxed text-slate-600">{actionMessage.eventData.note}</p>}
                    {!counterFormOpen
                      && selectedConversation.bookingStatus === "pending"
                      && actionMessage.eventData.status === "pending"
                      && actionMessage.eventData.proposedBy !== role
                      && actionMessage.eventData.counterOfferId && (
                        <button
                          type="button"
                          disabled={isActionSubmitting}
                          onClick={() => handleCounterOfferAction(actionMessage)}
                          className="dashboard-focus mt-3 min-h-10 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-900 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Make counter-offer
                        </button>
                      )}
                  </div>
                )}

                {selectedConversation.bookingStatus === "pending" && selectedConversation.pendingCounterOffer && !counteringOfferId && (
                  <p className="mt-3 rounded-md bg-amber-50 p-3 text-xs text-amber-900">A counter-offer is awaiting the other participant&apos;s response.</p>
                )}

                {counterFormOpen && selectedConversation.bookingStatus === "pending" && (!selectedConversation.pendingCounterOffer || counteringOfferId) && (
                  <form onSubmit={handleCounterOfferSubmit} className="mt-3 space-y-3 rounded-xl border border-sky-100 bg-slate-50/70 p-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{counteringOfferId ? "Reply with a counter-offer" : "Counter the task offer"}</p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{role === "provider" ? "Propose a task price and duration. Travel fare and tip stay unchanged." : "Propose a task price for the current duration. Travel fare and tip stay unchanged."}</p>
                    </div>
                    <BookingPriceBreakdown
                      booking={counteringOfferId && actionMessage?.eventData ? {
                        ...selectedConversation,
                        offeredPrice: actionMessage.eventData.proposedPrice,
                        estimatedDurationMinutes: actionMessage.eventData.counterOfferDurationMinutes ?? selectedConversation.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES,
                        totalPrice: Number(actionMessage.eventData.proposedPrice || 0) + Number(selectedConversation.travelFee || 0) + Number(selectedConversation.tipAmount || 0),
                      } : selectedConversation}
                      className="bg-white"
                      taskLabel={counteringOfferId ? "Current counter-offer" : "Current task offer"}
                      totalLabel="Current total"
                    />
                    <div className="grid grid-cols-1 gap-3">
                      <label className="text-xs font-semibold text-slate-700">Task offer for {role === "provider" ? counterOfferDurationMinutes : (counteringOfferId ? actionMessage?.eventData?.counterOfferDurationMinutes : null) ?? selectedConversation.estimatedDurationMinutes ?? DEFAULT_ESTIMATED_DURATION_MINUTES} minutes (PHP)
                        <input type="number" min="100" step="1" value={counterOfferPrice} onChange={(event) => { setCounterOfferPrice(event.target.value); updateCounterOfferTyping(Boolean(event.target.value.trim() || counterOfferNote.trim())); }} placeholder={`Current ₱${Number(selectedConversation.offeredPrice || 0).toLocaleString("en-PH")}`} className="dashboard-focus mt-1 block min-h-11 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900" />
                      </label>
                      {role === "provider" && (
                        <label className="text-xs font-semibold text-slate-700">Proposed duration (minutes)
                          <input
                            type="number"
                            min="15"
                            max="720"
                            step="15"
                            value={counterOfferDurationMinutes}
                            onChange={(event) => { setCounterOfferDurationMinutes(event.target.value); updateCounterOfferTyping(Boolean(counterOfferPrice.trim() || counterOfferNote.trim() || event.target.value.trim())); }}
                            className="dashboard-focus mt-1 block min-h-11 w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900"
                          />
                          <span className="mt-1 block font-normal text-slate-500">15-minute increments, up to 12 hours. Schedule conflicts are checked before the offer is sent and again when accepted.</span>
                        </label>
                      )}
                    </div>
                    <label className="block text-xs font-semibold text-slate-700">Note
                      <textarea maxLength={500} rows={2} value={counterOfferNote} onChange={(event) => { setCounterOfferNote(event.target.value); updateCounterOfferTyping(Boolean(counterOfferPrice.trim() || event.target.value.trim())); }} placeholder="Add context for your task-price counter" className="dashboard-focus mt-1 block w-full rounded-xl border border-sky-100 bg-white px-3 py-2 text-sm text-slate-900" />
                    </label>
                    {actionError && <p role="alert" className="text-xs text-red-700">{actionError}</p>}
                    <button type="submit" disabled={isActionSubmitting || !counterOfferPrice} className="dashboard-primary-button dashboard-focus min-h-10 px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-50">{isActionSubmitting ? "Sending…" : "Send counter-offer"}</button>
                  </form>
                )}

                {role === "client" && canRequestCancellation(selectedConversation) ? (
                  <button type="button" onClick={() => { setActionError(""); setActionModalView("CONFIRM_CANCEL"); }} className="ml-2 mt-4 inline-flex min-h-9 items-center justify-center rounded-md border border-red-300 bg-white px-3 py-2 text-xs font-medium text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2">Cancel booking</button>
                ) : role === "client" && getCancellationLockMessage(selectedConversation) ? (
                  <p className="mt-4 border-t border-gray-100 pt-3 text-xs font-medium text-gray-500" title={getCancellationLockMessage(selectedConversation)}>{getCancellationLockMessage(selectedConversation)}</p>
                ) : null}
                {!counterFormOpen && actionError && <p role="alert" className="mt-3 text-xs text-red-700">{actionError}</p>}
              </div>
              )}
            </section>
          </div>
        )}
        {revisionRequestOpen && selectedConversation && (
          <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4" onClick={() => setRevisionRequestOpen(false)}>
            <form onSubmit={handleRevisionRequest} className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="p-5">
                <h2 className="text-lg font-bold text-gray-900">Request a revision</h2>
                <p className="mt-1 text-sm text-gray-500">Describe what still needs attention. Add optional photos to document the issue.</p>
                <label htmlFor="revision-request-note" className="mt-4 block text-xs font-medium text-gray-700">Revision details
                  <textarea id="revision-request-note" required maxLength={1000} rows={4} value={revisionNote} onChange={(event) => setRevisionNote(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                <label htmlFor="revision-request-photos" className="mt-4 block text-xs font-medium text-gray-700">Issue photos (optional)
                  <input id="revision-request-photos" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={(event) => setRevisionPhotos(Array.from(event.target.files || []).slice(0, 5))} className="mt-1 block w-full text-sm text-gray-600" />
                </label>
                {revisionPhotos.length > 0 && <p className="mt-1 text-xs text-gray-500">{revisionPhotos.length} photo{revisionPhotos.length === 1 ? "" : "s"} selected.</p>}
                {actionError && <p role="alert" className="mt-2 text-xs text-red-700">{actionError}</p>}
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setRevisionRequestOpen(false)} className="flex-1 rounded-md border border-gray-200 py-2 text-sm font-semibold text-gray-700">Cancel</button>
                  <button type="submit" disabled={isActionSubmitting || !revisionNote.trim()} className="flex-1 rounded-md bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{isActionSubmitting ? "Sending…" : "Send request"}</button>
                </div>
              </div>
            </form>
          </div>
        )}
        {revisionProofOpen && selectedConversation && (
          <CompletionProofModal
            bookingName={selectedConversation.task}
            onSubmit={completionProofMode === "revision" ? handleRevisionResubmission : handleCompleteBookingInChat}
            onClose={() => {
              setRevisionProofOpen(false);
              setCompletionProofMode("normal");
            }}
          />
        )}
        {supportReportOpen && selectedConversation && (
          <div className="fixed inset-0 z-90 flex items-center justify-center bg-black/50 p-4" onClick={() => setSupportReportOpen(false)}>
            <form onSubmit={handleSupportReport} className="w-full max-w-md rounded-xl bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
              <div className="p-5">
                <h2 className="text-lg font-bold text-gray-900">Report a conversation issue</h2>
                <p className="mt-1 text-sm text-gray-500">Booking: {selectedConversation.task}</p>
                <label className="mt-4 block text-xs font-medium text-gray-700">What happened?
                  <textarea required maxLength={1000} rows={4} value={supportReportDetails} onChange={(event) => setSupportReportDetails(event.target.value)} className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
                </label>
                {actionError && <p role="alert" className="mt-2 text-xs text-red-700">{actionError}</p>}
                <div className="mt-5 flex gap-2">
                  <button type="button" onClick={() => setSupportReportOpen(false)} className="flex-1 rounded-md border border-gray-200 py-2 text-sm font-semibold text-gray-700">Cancel</button>
                  <button type="submit" disabled={isActionSubmitting || !supportReportDetails.trim()} className="flex-1 rounded-md bg-primary-600 py-2 text-sm font-semibold text-white disabled:opacity-50">{isActionSubmitting ? "Sending…" : "Send report"}</button>
                </div>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
