# Booking Expiry and Travel Buffer

## How it works

- **Same-day requests:** The server starts a 15-minute expiry when the booking request is received. If the provider does not accept in time, the request is marked **Expired** and cannot be accepted. The expiry job checks every 10 seconds.
- **Future bookings:** Requests scheduled for a later calendar day do not get the 15-minute expiry.
- **Arrival check:** For same-day requests, the server estimates travel time from the provider-to-client distance at 30 km/h, adds a 15-minute buffer, and requires that much notice before creating the request. The same check runs again before acceptance. Requests that are too close to the appointment are rejected so the provider has time to travel.
- **Provider interface:** The incoming request shows its countdown and disables **Accept** when the request has expired or the arrival window has passed. The server remains authoritative for both checks.

## Global travel controls

Administrators can change the maximum provider distance and travel fee rates from **Admin → Settings**. Defaults are a 50 km cap and a ₱20 base plus ₱10 for every kilometer. The server applies the current cap and rates when it creates a travel quote and again when a client submits a booking. A travel-fee voucher reduces only the travel fee; it does not reduce the provider's task offer or tip. Existing bookings retain their saved quote.

Maintenance mode pauses new booking submissions only. Browsing and existing booking workflows remain available.

## Refund requests and cash settlement

TaskPanda bookings use cash on completion; the platform does not collect or reverse cash. A client may request an admin refund review within 48 hours of the recorded work-completion time for a completed, disputed, or settled booking. The request records the reason, requested cash amount, description, and optional photo evidence, and moves the booking to refund review.

Admins may approve the requested cash amount in full, approve a smaller cash amount, or reject the request with a justification. Any approved cash repayment is an auditable provider-to-client obligation and must be exchanged directly by those parties; no provider wallet debit or platform cash transfer is implied. If the client did not confirm cash payment, a physical cash refund cannot be approved. When an approved request used a travel-fee voucher, the system restores that voucher to the client's wallet. A voucher-only resolution does not move physical cash.

The existing 48-hour automatic cash-settlement fallback updates booking settlement state but is not proof that cash changed hands. Refund eligibility uses the client's explicit cash-paid confirmation and excludes a confirmation synthesized by that fallback.

Rejected requests restore the booking's prior completed, disputed, or settled status. A rejected request may be resubmitted only while the 48-hour window remains open. Canceled and provider-no-show bookings are not eligible for this completed-work refund endpoint; their existing cancellation/no-show paths restore applicable travel-fee vouchers.
