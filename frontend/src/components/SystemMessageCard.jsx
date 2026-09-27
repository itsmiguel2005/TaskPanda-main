function formatPrice(value) {
  return `₱${Number(value || 0).toLocaleString("en-PH")}`;
}

function formatAppointment(date, time) {
  if (!date) return time || "Schedule unchanged";
  const dateText = new Date(date).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric", year: "numeric" });
  return time ? `${dateText} · ${time}` : dateText;
}

const EVENT_TITLES = {
  booking_request: "New booking request",
  booking_status: "Booking update",
  counter_offer: "Counter-offer",
  payment: "Cash payment update",
  digital_receipt: "Digital receipt",
  provider_update: "Provider update",
  cancellation: "Cancellation update",
  revision_request: "Revision requested",
  revision_response: "Revision response",
  review: "Review submitted",
  system: "Booking notice",
};

function describeEvent(message, actorName) {
  const event = message.eventData || {};
  const actor = actorName || "The other participant";
  const status = String(event.status || "").replaceAll("_", " ");
  if (message.eventType === "booking_request") return `${actor} requested a booking`;
  if (message.eventType === "booking_status") return `${actor} updated the booking${status ? ` to ${status}` : ""}`;
  if (message.eventType === "counter_offer") {
    if (event.status === "accepted") return `${actor} accepted the counter-offer`;
    if (event.status === "rejected") return `${actor} declined the counter-offer`;
    return `${actor} proposed a counter-offer: ${formatPrice(event.proposedPrice)}`;
  }
  if (message.eventType === "payment") return `${actor} confirmed ${event.confirmation === "cash_paid" ? "cash payment" : "cash received"}`;
  if (message.eventType === "digital_receipt") return `${actor} issued a digital receipt`;
  if (message.eventType === "provider_update") return `${actor} sent a booking update`;
  if (message.eventType === "revision_request") return `${actor} requested a revision`;
  if (message.eventType === "revision_response") return `${actor} responded to the revision request`;
  if (message.eventType === "review") return `${actor} left a ${event.rating || 0}/5 star review`;
  if (message.eventType === "cancellation") {
    if (event.status === "cancel_requested") return `${actor} requested to cancel the booking`;
    if (event.cancellationOutcome === "rejected") return `${actor} declined the cancellation request`;
    return `${actor} canceled the booking`;
  }
  return `${actor} posted a booking update`;
}

function renderReviewStars(rating) {
  const numericRating = Number.isFinite(Number(rating)) ? Math.max(0, Math.min(5, Number(rating))) : 0;
  return (
    <span className="inline-flex items-center gap-0.5 text-base font-semibold tracking-wide" aria-label={`${numericRating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <span key={star} style={{ color: star <= numericRating ? "#fbbf24" : "#d1d5db", lineHeight: 1 }}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function SystemMessageCard({ message, role, actorName, isMine, onOpen, onRespondToOffer }) {
  const event = message.eventData || {};
  const canRespond = message.eventType === "counter_offer"
    && event.status === "pending"
    && event.proposedBy !== role
    && event.counterOfferId;

  return (
    <article className={`my-2 w-full max-w-lg rounded-lg border px-3 py-3 text-xs shadow-sm ${isMine ? "border-primary-200 bg-primary-50 text-primary-950" : "border-gray-200 bg-gray-50 text-gray-900"}`}>
      <div>
        <span className="block text-[10px] font-semibold uppercase text-gray-500">{EVENT_TITLES[message.eventType] || "Booking update"}</span>
        <span className="mt-1 block font-semibold">{describeEvent(message, actorName)}</span>
        <span className="mt-1 block text-gray-600">{message.text}</span>
        {message.eventType === "counter_offer" && (
          <span className="mt-2 block rounded-md border border-gray-200 bg-white p-2 text-gray-900">
            <span className="block font-semibold">{formatPrice(event.proposedPrice)}</span>
            <span className="mt-0.5 block">{formatAppointment(event.proposedServiceDate, event.proposedTimeSlot)}</span>
            {event.proposedRepairDescription && <span className="mt-0.5 block">{event.proposedRepairDescription}</span>}
            {event.note && <span className="mt-1 block text-gray-600">{event.note}</span>}
            {event.status !== "pending" && <span className="mt-1 block font-semibold capitalize">Offer {event.status}</span>}
          </span>
        )}
        {(message.eventType === "revision_request" || message.eventType === "revision_response") && (
          <span className="mt-2 block rounded-md border border-gray-200 bg-white p-2 text-gray-700">
            {event.note && <span className="block">{event.note}</span>}
            {event.responseNote && <span className="block">{event.responseNote}</span>}
            {event.status && <span className="mt-1 block text-[10px] font-semibold uppercase text-gray-500">{event.status.replaceAll("_", " ")}</span>}
            <span className="mt-2 flex flex-wrap gap-2">{(event.photos || []).map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Revision issue" className="h-14 w-14 rounded border border-gray-200 object-cover" /></a>)}</span>
          </span>
        )}
        {message.eventType === "review" && (
          <span className="mt-2 block rounded-md border border-amber-200 bg-white p-2 text-gray-800">
            <span className="block">{renderReviewStars(event.rating)}</span>
            {event.review && <span className="mt-1 block">{event.review}</span>}
            <span className="mt-2 flex flex-wrap gap-2">{(event.reviewPhotos || []).map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Client review" className="h-14 w-14 rounded border border-amber-200 object-cover" /></a>)}</span>
          </span>
        )}
        {message.eventType === "booking_status" && event.status === "complete" && (
          <span className="mt-2 block rounded-md border border-gray-200 bg-white p-2 text-gray-800">
            {event.completionNote && <span className="block font-medium">{event.completionNote}</span>}
            {event.completionSubmittedAt && <time className="mt-1 block text-[10px] text-gray-500" dateTime={event.completionSubmittedAt}>Proof submitted {new Date(event.completionSubmittedAt).toLocaleString()}</time>}
            <span className="mt-2 flex flex-wrap gap-2">
              {(event.completionPhotos || []).map((photo) => <a key={photo} href={photo} target="_blank" rel="noreferrer"><img src={photo} alt="Completion proof" className="h-14 w-14 rounded border border-gray-200 object-cover" /></a>)}
            </span>
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <time className="text-[10px] text-gray-500" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time>
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => onOpen(message)} className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100" aria-label={`View ${EVENT_TITLES[message.eventType] || "booking"} details`}>View details</button>
          {canRespond && <>
            <button type="button" onClick={() => onRespondToOffer(event.counterOfferId, "reject")} className="rounded border border-gray-300 bg-white px-2 py-1 font-semibold text-gray-700 hover:bg-gray-100">Reject</button>
            <button type="button" onClick={() => onRespondToOffer(event.counterOfferId, "accept")} className="rounded border border-primary-700 bg-primary-700 px-2 py-1 font-semibold text-white hover:bg-primary-800">Accept offer</button>
          </>}
        </div>
      </div>
    </article>
  );
}
