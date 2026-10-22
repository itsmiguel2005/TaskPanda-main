# Booking Expiry and Travel Buffer

## How it works

- **Advance same-day and future requests:** Requests made more than 30 minutes before the same-day appointment, and all future-day requests, stay pending until 30 minutes before the appointment. They do not receive a 15-minute creation timer.
- **Urgent same-day requests:** Requests made within 30 minutes of the appointment receive a 15-minute provider response timer. They may be accepted inside the usual 30-minute cutoff, but the timer ends at the appointment time if that comes first. Existing travel-time and schedule-conflict checks still apply.
- **Expiry records:** The server records the expiry time and reason, and the expiry job checks every 10 seconds.
- **Voucher restoration:** When an unaccepted request expires, any redeemed travel-fee voucher is restored to the client's wallet. This is safe to retry if restoration was interrupted.
- **Read and accept checks:** Booking list retrieval processes overdue pending requests before returning them. Provider acceptance is checked against the applicable urgent-response timer or appointment cutoff.
- **Arrival check:** For same-day requests, the server estimates travel time from the provider-to-client distance at 30 km/h, adds a 15-minute buffer, and requires that much notice before creating the request. The same check runs again before acceptance. Requests that are too close to the appointment are rejected so the provider has time to travel.
- **Provider interface:** The incoming request shows its expiry countdown and disables **Accept** when the request has expired or the arrival window has passed. The server remains authoritative for both checks.

## Cancellation behavior

- **Provider cancels a confirmed booking:** Always creates a cancellation request, even during the first 10 minutes after booking creation. A reason is required, and the client must approve it before the booking is canceled.
- **Provider cancels a pending request:** The existing 10-minute-from-creation grace remains: cancellation is immediate during that period; afterward, the provider must give a reason and request client approval.
- **Client cancellation:** Existing behavior is unchanged, including the 10-minute-from-creation immediate-cancellation grace.
- **Cancellation request response window:** The existing schedule-based response window remains unchanged.

## Global travel controls

Administrators can change the maximum provider distance and travel fee rates from **Admin → Settings**. Defaults are a 50 km cap and a ₱20 base plus ₱10 for every kilometer. The server applies the current cap and rates when it creates a travel quote and again when a client submits a booking. A travel-fee voucher reduces only the travel fee; it does not reduce the provider's task offer or tip. Existing bookings retain their saved quote.

Maintenance mode pauses new booking submissions only. Browsing and existing booking workflows remain available.

## Refund requests and cash settlement

TaskPanda bookings use cash on completion; the platform does not collect or reverse cash. A client may request an admin refund review within 48 hours of the recorded work-completion time for a completed, disputed, or settled booking. The request records the reason, requested cash amount, description, and optional photo evidence, and moves the booking to refund review.

Admins may approve the requested cash amount in full, approve a smaller cash amount, or reject the request with a justification. Any approved cash repayment is an auditable provider-to-client obligation and must be exchanged directly by those parties; no provider wallet debit or platform cash transfer is implied. If the client did not confirm cash payment, a physical cash refund cannot be approved. When an approved request used a travel-fee voucher, the system restores that voucher to the client's wallet. A voucher-only resolution does not move physical cash.

The existing 48-hour automatic cash-settlement fallback updates booking settlement state but is not proof that cash changed hands. Refund eligibility uses the client's explicit cash-paid confirmation and excludes a confirmation synthesized by that fallback.

Rejected requests restore the booking's prior completed, disputed, or settled status. A rejected request may be resubmitted only while the 48-hour window remains open. Canceled and provider-no-show bookings are not eligible for this completed-work refund endpoint; their existing cancellation/no-show paths restore applicable travel-fee vouchers.
