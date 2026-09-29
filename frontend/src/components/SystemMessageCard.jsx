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
  if (message.eventType === "booking_status" && event.status === "declined") return `${actor} declined the booking`;
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

function getEventPresentation(message) {
  const event = message.eventData || {};
  const status = String(event.status || "").toLowerCase();

  if (message.eventType === "booking_request") return { title: "New Booking Request", badge: "Pending", tone: "amber" };
  if (message.eventType === "booking_status") {
    const presentations = {
      approved: { title: "Request Accepted", badge: "Approved", tone: "emerald" },
      en_route: { title: "Provider On The Way", badge: "On the way", tone: "blue" },
      in_progress: { title: "Work Started", badge: "In progress", tone: "blue" },
      complete: { title: "Work Completed", badge: "Completed", tone: "emerald" },
      declined: { title: "Declined by Provider", badge: "Declined", tone: "rose" },
      canceled: { title: "Booking Cancelled", badge: "Cancelled", tone: "slate" },
    };
    return presentations[status] || { title: "Booking Update", badge: "Updated", tone: "slate" };
  }
  if (message.eventType === "counter_offer") {
    if (status === "accepted") return { title: "Counter-offer Accepted", badge: "Accepted", tone: "emerald" };
    if (status === "rejected") return { title: "Counter-offer Declined", badge: "Declined", tone: "rose" };
    return { title: "Counter-offer Proposed", badge: "Awaiting response", tone: "blue" };
  }
  if (message.eventType === "cancellation") {
    if (event.cancellationOutcome === "rejected") return { title: "Cancellation Declined", badge: "Booking remains active", tone: "amber" };
    if (status === "cancel_requested") return { title: "Cancellation Requested", badge: "Awaiting response", tone: "amber" };
    return { title: "Booking Cancelled", badge: "Cancelled", tone: "slate" };
  }
  if (message.eventType === "payment") return { title: "Cash Payment Update", badge: "Confirmed", tone: "emerald" };
  if (message.eventType === "revision_request") return { title: "Revision Requested", badge: "Review needed", tone: "amber" };
  if (message.eventType === "revision_response") return { title: "Revision Update", badge: status.replaceAll("_", " ") || "Updated", tone: status === "disputed" ? "rose" : "emerald" };
  if (message.eventType === "review") return { title: "Review Submitted", badge: `${event.rating || 0}/5`, tone: "amber" };
  return { title: EVENT_TITLES[message.eventType] || "Booking Update", badge: "Update", tone: "slate" };
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

export default function SystemMessageCard({ message, role, actorName, onOpen, onRespondToOffer }) {
  const event = message.eventData || {};
  const presentation = getEventPresentation(message);
  const cardTones = {
    slate: "border-slate-200",
    amber: "border-amber-200",
    emerald: "border-emerald-200",
    rose: "border-rose-200",
    blue: "border-blue-200",
  };
  const badgeTones = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
  };
  const canRespond = message.eventType === "counter_offer"
    && event.status === "pending"
    && event.proposedBy !== role
    && event.counterOfferId;

  return (
    <article className={`my-2 w-full max-w-xl rounded-2xl border bg-white px-3 py-3 text-sm text-slate-900 shadow-sm sm:px-4 ${cardTones[presentation.tone] || cardTones.slate}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">{presentation.title}</h3>
            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badgeTones[presentation.tone] || badgeTones.slate}`}>{presentation.badge}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{describeEvent(message, actorName)}</p>
        </div>
        <time className="shrink-0 text-[10px] text-slate-400" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time>
      </div>
      {message.eventType === "booking_request" && (event.repairDescription || message.text) && (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 shadow-inner shadow-amber-100/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">Task summary</span>
            <span className="rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-amber-800">{formatPrice(event.offeredPrice)}</span>
          </div>
          <p className="mt-2 text-sm font-bold leading-relaxed text-amber-950">{event.repairDescription || message.text}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium text-amber-800">
            {event.serviceDate && <span className="rounded-full bg-amber-100 px-2 py-1">{formatAppointment(event.serviceDate, event.timeSlot)}</span>}
            <span className="rounded-full bg-amber-100 px-2 py-1">{event.paymentMethod === "cash" ? "Cash on completion" : String(event.paymentMethod || "Payment arranged")}</span>
          </div>
        </div>
      )}
      {message.text && message.eventType !== "booking_request" && <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs leading-relaxed text-slate-600">{message.text}</p>}
      <div>
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
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => onOpen(message)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50" aria-label={`View ${EVENT_TITLES[message.eventType] || "booking"} details`}>View details</button>
          {canRespond && <>
            <button type="button" onClick={() => onRespondToOffer(event.counterOfferId, "reject")} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50">Decline offer</button>
            <button type="button" onClick={() => onRespondToOffer(event.counterOfferId, "accept")} className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-700">Accept offer</button>
          </>}
        </div>
      </div>
    </article>
  );
}
