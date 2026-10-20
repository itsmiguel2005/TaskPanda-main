import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { apiFetch } from "../services/api.js";
import PandaBotProfileCard from "./PandaBotProfileCard.jsx";

const clientQuickActions = [
  "Find top pros near me",
  "How do bamboo stamps work?",
  "Track my booking",
];
const providerQuickActions = [
  "Show my pending requests",
  "What jobs do I have today?",
  "Show my earnings this week",
  "What’s my rating and verification status?",
];

function createWelcomeMessage(role, user) {
  const firstName = String(user?.fullName || "").trim().split(/\s+/)[0];
  const greeting = firstName ? `Hey, ${firstName}!` : "Hey!";
  return {
    id: role === "provider" ? "pandabot-provider-welcome" : "pandabot-welcome",
    role: "assistant",
    contextIntroduction: true,
    text: role === "provider"
      ? `${greeting} I can help you keep tabs on incoming jobs, your schedule, or earnings. What do you need a hand with?`
      : `${greeting} I can help with your bookings, rewards, or finding a local pro. What do you need a hand with?`,
  };
}

function renderInlineMarkdown(line, keyPrefix) {
  return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key} className="rounded bg-slate-100 px-1 py-0.5 text-xs">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

function renderAssistantMessage(text) {
  return text.split(/\r?\n/).map((line, index) => {
    const key = `assistant-line-${index}`;
    if (!line.trim()) return <div key={key} className="h-2" />;
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      return <p key={key} className="font-bold">{renderInlineMarkdown(heading[2], key)}</p>;
    }
    if (line.startsWith("- ")) {
      return <p key={key} className="pl-2">{renderInlineMarkdown(line.slice(2), key)}</p>;
    }
    return <p key={key}>{renderInlineMarkdown(line, key)}</p>;
  });
}

function getProfileLocation(user) {
  return {
    city: user?.city || user?.municipality || user?.town || "",
    region: user?.province || user?.region || "",
  };
}

function PandaMark({ className = "" }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ${className}`} aria-hidden="true">
      <img src="/assets/PandaBotFace.png" alt="" className="h-[88%] w-[88%] object-contain" />
    </span>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      <path d="m21 3-7.2 18-3.7-7.1L3 10.2 21 3Z" />
      <path d="M10.1 13.9 15 9" />
    </svg>
  );
}

function ScrollIcon({ direction }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

function RecommendationCard({ provider, onBook }) {
  const rating = Number(provider.rating);
  const reviewCount = Number(provider.reviewCount);
  const isNew = provider.isNew || reviewCount <= 0;
  const availableSlots = Array.isArray(provider.availableSlots) ? provider.availableSlots : [];

  return (
    <article className="w-full rounded-xl border border-emerald-100 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-bold text-slate-900">{provider.name}</h3>
          <p className="mt-0.5 text-xs font-medium text-emerald-800">{provider.category}</p>
          {provider.location && <p className="mt-1 truncate text-xs text-slate-500">{provider.location}</p>}
          {provider.isFavorite && <p className="mt-1 text-xs font-semibold text-rose-700">Saved in your favourites</p>}
        </div>
        <p className={`shrink-0 text-xs font-semibold ${isNew ? "text-slate-600" : "text-amber-700"}`} aria-label={isNew ? "New provider with no ratings yet" : `${rating.toFixed(1)} out of 5 stars`}>
          {isNew ? "New · No ratings yet" : <><span aria-hidden="true">★</span> {rating.toFixed(1)} <span className="font-normal text-slate-500">({reviewCount})</span></>}
        </p>
      </div>
      {provider.distanceKm != null && Number.isFinite(Number(provider.distanceKm)) && (
        <p className="mt-1 text-xs text-slate-600">{Number(provider.distanceKm).toFixed(1)} km away</p>
      )}
      {provider.estimatedTravelFee != null && Number.isFinite(Number(provider.estimatedTravelFee)) && (
        <p className="mt-1 text-xs text-slate-600">
          Est. travel fee {Number(provider.estimatedTravelFee).toLocaleString("en-PH", { style: "currency", currency: "PHP" })}
        </p>
      )}
      {provider.availabilityDateLabel && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold text-slate-800">
            {provider.availabilityDateLabel}
            {provider.availabilityDurationMinutes ? ` · ${provider.availabilityDurationMinutes}-minute task estimate` : ""}
          </p>
          {availableSlots.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {availableSlots.map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => onBook(time)}
                  className="dashboard-focus min-h-8 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-950 transition hover:border-emerald-500 hover:bg-emerald-100"
                  aria-label={`Start booking with ${provider.name} for ${provider.availabilityDateLabel} at ${time}`}
                >
                  {time}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-slate-600">No open slots were found for this date.</p>
          )}
          <p className="mt-2 text-[11px] leading-4 text-slate-500">Slots can change; booking checks again before you confirm.</p>
        </div>
      )}
      <button
        type="button"
        onClick={() => onBook("")}
        className="dashboard-focus mt-3 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-900"
      >
        {availableSlots.length ? "Choose another time" : "Book Now"}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M5 12h14m-6-6 6 6-6 6" />
        </svg>
      </button>
    </article>
  );
}

export default function PandaBotWidget({ initiallyOpen = false }) {
  const { isLoggedIn, isAuthLoading, role, user, token } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [hasUnreadAssistantMessage, setHasUnreadAssistantMessage] = useState(false);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [quickActionScroll, setQuickActionScroll] = useState({ left: false, right: false });
  const [messages, setMessages] = useState(() => [createWelcomeMessage(role, user)]);
  const quickActions = role === "provider" ? providerQuickActions : clientQuickActions;
  const messageListRef = useRef(null);
  const quickActionsRef = useRef(null);
  const inputRef = useRef(null);
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    messageListRef.current?.scrollTo({ top: messageListRef.current.scrollHeight, behavior: "smooth" });
  }, [isOpen, isSending, messages]);

  useEffect(() => {
    const viewport = quickActionsRef.current;
    if (!isOpen || !viewport) return undefined;

    const updateScrollButtons = () => {
      const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
      setQuickActionScroll({ left: viewport.scrollLeft > 1, right: maxScrollLeft - viewport.scrollLeft > 1 });
    };

    viewport.addEventListener("scroll", updateScrollButtons, { passive: true });
    const resizeObserver = new ResizeObserver(updateScrollButtons);
    resizeObserver.observe(viewport);
    updateScrollButtons();

    return () => {
      viewport.removeEventListener("scroll", updateScrollButtons);
      resizeObserver.disconnect();
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    setMessages([createWelcomeMessage(role, user)]);
  }, [role, user?.fullName]);

  if (isAuthLoading || !isLoggedIn) return null;

  async function sendMessage(rawMessage) {
    const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
    if (!message || isSending) return;

    const userMessage = { id: `${Date.now()}-user`, role: "user", text: message };
    setMessages((current) => [...current, userMessage]);
    setInput("");
    setIsSending(true);

    try {
      const supportEndpoint = role === "provider" ? "/api/ai/provider-support" : "/api/ai/support";
      const response = await apiFetch(supportEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message,
          location: getProfileLocation(user),
          conversationHistory: messages
            .filter((item) => item.role === "assistant" || item.role === "user")
            .map((item) => ({
              role: item.role,
              text: item.text,
              contextIntroduction: item.contextIntroduction === true,
              contextIntent: typeof item.contextIntent === "string" ? item.contextIntent : "",
              providerIds: Array.isArray(item.recommendations)
                ? item.recommendations
                  .map((provider) => provider.providerId || provider.id)
                  .filter((providerId) => typeof providerId === "string")
                : [],
              contextProviderIds: Array.isArray(item.providerContextIds)
                ? item.providerContextIds.filter((providerId) => typeof providerId === "string")
                : [],
              contextRequestedDate: item.contextRequestedDate || "",
              contextBookingTracking: item.contextBookingTracking === true,
            })),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "PandaBot couldn’t reply right now. Please try again.");
      const isProfileCard = data.type === "PROFILE_CARD";
      const profileData = isProfileCard &&
        data.data &&
        typeof data.data.name === "string" &&
        typeof data.data.profession === "string" &&
        typeof data.data.rating === "number" &&
        Number.isFinite(data.data.rating) &&
        typeof data.data.reviewCount === "number" &&
        Number.isFinite(data.data.reviewCount) &&
        typeof data.data.verificationStatus === "string"
        ? data.data
        : null;
      if (isProfileCard && !profileData) {
        throw new Error("PandaBot returned incomplete profile details. Please try again.");
      }
      const isRecommendationCards = data.type === "recommendation_cards" && typeof data.intro === "string";
      const responseText = isProfileCard
        ? `Provider profile: ${profileData.name}, ${profileData.profession}, ${Number(profileData.rating).toFixed(1)} stars, ${Math.max(0, Math.floor(Number(profileData.reviewCount)))} reviews.`
        : isRecommendationCards
        ? data.intro
        : data.response;
      if (typeof responseText !== "string" || !responseText.trim()) {
        throw new Error("PandaBot returned an empty reply. Please try again.");
      }
      const recommendations = isRecommendationCards && Array.isArray(data.providers)
        ? data.providers
          .filter((provider) => provider && typeof provider.providerId === "string" && provider.name)
          .map((provider) => ({ ...provider, id: provider.providerId }))
        : Array.isArray(data.recommendations)
        ? data.recommendations.filter((provider) => provider && typeof provider.id === "string" && provider.name)
        : [];
      setMessages((current) => [...current, {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        type: isProfileCard ? "PROFILE_CARD" : "",
        text: responseText.trim(),
        profileData,
        recommendations,
        providerContextIds: Array.isArray(data.contextProviderIds) ? data.contextProviderIds : [],
        contextRequestedDate: typeof data.contextRequestedDate === "string" ? data.contextRequestedDate : "",
        contextBookingTracking: data.contextBookingTracking === true,
        contextIntroduction: data.contextIntroduction === true,
        contextIntent: typeof data.contextIntent === "string" ? data.contextIntent : "",
      }]);
      if (!isOpenRef.current) setHasUnreadAssistantMessage(true);
    } catch (error) {
      setMessages((current) => [...current, {
        id: `${Date.now()}-error`,
        role: "error",
        text: error.message || "PandaBot is unavailable right now. Please try again shortly.",
      }]);
    } finally {
      setIsSending(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    void sendMessage(input);
  }

  function handleBookRecommendation(provider, time = "") {
    setIsOpen(false);
    const params = new URLSearchParams({ bookProvider: provider.id });
    if (provider.availabilityDate) params.set("bookDate", provider.availabilityDate);
    if (time) params.set("bookTime", time);
    navigate(`/explore?${params}`);
  }

  function scrollQuickActions(direction) {
    quickActionsRef.current?.scrollBy({ left: direction * 180, behavior: "smooth" });
  }

  return (
    <div data-onboarding-target="pandabot" className="fixed bottom-4 right-4 z-70 flex flex-col items-end sm:bottom-6 sm:right-6">
      {isOpen && (
        <section
          aria-label="PandaBot customer support chat"
          className="mb-3 flex h-[min(36rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_70px_rgba(15,23,42,0.24)] content-arrive"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 bg-emerald-950 px-4 py-3.5 text-white">
            <div className="flex min-w-0 items-center gap-3">
              <PandaMark className="h-10 w-10" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold">PandaBot</h2>
                <p className="mt-0.5 truncate text-xs text-emerald-100">TaskPanda support</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="dashboard-focus flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-50 transition hover:bg-white/10"
              aria-label="Close PandaBot chat"
              title="Close chat"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-5 w-5" aria-hidden="true">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </header>

          <div
            ref={messageListRef}
            className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3.5 py-4 sm:px-4"
            aria-live="polite"
            aria-relevant="additions text"
          >
            {messages.map((item) => (
              <div key={item.id} className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={item.role === "user" ? "max-w-[88%]" : "w-full max-w-[94%]"}>
                  <div className={`whitespace-pre-wrap wrap-break-word rounded-2xl px-3.5 py-2.5 text-sm leading-5 ${
                    item.type === "PROFILE_CARD"
                      ? "rounded-bl-md bg-transparent p-0 text-slate-800 shadow-none"
                      : item.role === "user"
                      ? "rounded-br-md bg-emerald-800 text-white"
                      : item.role === "error"
                      ? "rounded-bl-md border border-rose-200 bg-rose-50 text-rose-800"
                      : "rounded-bl-md border border-slate-200 bg-white text-slate-800 shadow-sm"
                  }`}>
                    {item.type === "PROFILE_CARD"
                      ? <PandaBotProfileCard profile={item.profileData} />
                      : item.role === "assistant"
                      ? renderAssistantMessage(item.text)
                      : item.text}
                  </div>
                  {item.role === "assistant" && item.recommendations?.length > 0 && (
                    <div className="mt-2.5 space-y-2">
                      {item.recommendations.map((provider) => (
                        <RecommendationCard
                          key={provider.id}
                          provider={provider}
                          onBook={(time) => handleBookRecommendation(provider, time)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start" role="status" aria-label="PandaBot is replying">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-slate-200 bg-white px-3.5 py-3 text-xs text-slate-500 shadow-sm">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-700 [animation-delay:-0.2s]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-700 [animation-delay:-0.1s]" />
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-700" />
                  <span className="sr-only">PandaBot is replying</span>
                </div>
              </div>
            )}
          </div>

          <nav aria-label="PandaBot quick questions" className="flex shrink-0 items-center gap-1.5 border-t border-slate-200 bg-white px-2.5 py-2">
            <button
              type="button"
              onClick={() => scrollQuickActions(-1)}
              disabled={!quickActionScroll.left}
              className="dashboard-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-default disabled:opacity-30"
              aria-label="Scroll suggestions left"
              title="Scroll suggestions left"
            >
              <ScrollIcon direction="left" />
            </button>
            <div
              ref={quickActionsRef}
              className="pandabot-action-scroll flex min-w-0 flex-1 gap-2 overflow-x-auto overscroll-x-contain py-1"
            >
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  disabled={isSending}
                  onClick={() => void sendMessage(action)}
                  className="dashboard-focus min-h-8 shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-950 transition hover:border-emerald-400 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-50"
                >
                  {action}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => scrollQuickActions(1)}
              disabled={!quickActionScroll.right}
              className="dashboard-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-emerald-900 transition hover:bg-emerald-50 disabled:cursor-default disabled:opacity-30"
              aria-label="Scroll suggestions right"
              title="Scroll suggestions right"
            >
              <ScrollIcon direction="right" />
            </button>
          </nav>

          <form onSubmit={handleSubmit} className="flex shrink-0 items-end gap-2 border-t border-slate-200 bg-white p-3">
            <label className="sr-only" htmlFor="pandabot-message">Message PandaBot</label>
            <textarea
              ref={inputRef}
              id="pandabot-message"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={role === "provider" ? "Ask about your jobs, earnings, or profile..." : "Ask about a booking or service..."}
              rows={1}
              maxLength={4000}
              disabled={isSending}
              className="dashboard-focus max-h-28 min-h-11 flex-1 resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-5 text-slate-900 placeholder:text-slate-400 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isSending || !input.trim()}
              className="dashboard-focus flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:bg-slate-300"
              aria-label="Send message"
              title="Send message"
            >
              {isSending ? (
                <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 animate-spin" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                </svg>
              ) : <SendIcon />}
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => {
          const nextOpen = !isOpenRef.current;
          isOpenRef.current = nextOpen;
          setIsOpen(nextOpen);
          if (nextOpen) setHasUnreadAssistantMessage(false);
        }}
        className={`dashboard-focus relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-emerald-800 shadow-[0_8px_28px_rgba(6,78,59,0.38)] transition duration-200 hover:-translate-y-0.5 hover:bg-emerald-900 motion-reduce:transform-none ${hasUnreadAssistantMessage && !isOpen ? "pandabot-attention" : ""}`}
        aria-label={isOpen ? "Close PandaBot support" : hasUnreadAssistantMessage ? "Open PandaBot support, new message" : "Open PandaBot support"}
        aria-expanded={isOpen}
        title={isOpen ? "Close support chat" : "Chat with PandaBot"}
      >
        {isOpen ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-6 w-6 text-white" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        ) : (
          <>
            <PandaMark className="h-10 w-10" />
            {hasUnreadAssistantMessage && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white bg-rose-500" aria-label="New PandaBot message">
                <span className="sr-only">New message</span>
              </span>
            )}
          </>
        )}
      </button>
    </div>
  );
}