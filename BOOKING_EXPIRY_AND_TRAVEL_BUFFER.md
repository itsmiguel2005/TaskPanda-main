# Booking Expiry and Travel Buffer

## How it works

- **Same-day requests:** The server starts a 15-minute expiry when the booking request is received. If the provider does not accept in time, the request is marked **Expired** and cannot be accepted. The expiry job checks every 10 seconds.
- **Future bookings:** Requests scheduled for a later calendar day do not get the 15-minute expiry.
- **Arrival check:** For same-day requests, the server estimates travel time from the provider-to-client distance at 30 km/h, adds a 15-minute buffer, and requires that much notice before creating the request. The same check runs again before acceptance. Requests that are too close to the appointment are rejected so the provider has time to travel.
- **Provider interface:** The incoming request shows its countdown and disables **Accept** when the request has expired or the arrival window has passed. The server remains authoritative for both checks.

## Global travel controls

Administrators can change the maximum provider distance and travel fee rates from **Admin → Settings**. Defaults are a 50 km cap and a ₱20 base plus ₱10 for every kilometer. The server applies the current cap and rates when it creates a travel quote and again when a client submits a booking. A travel-fee voucher reduces only the travel fee; it does not reduce the provider's task offer or tip. Existing bookings retain their saved quote.

Maintenance mode pauses new booking submissions only. Browsing and existing booking workflows remain available.
