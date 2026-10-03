# Booking Expiry and Travel Buffer

## How it works

- **Same-day requests:** The server starts a 15-minute expiry when the booking request is received. If the provider does not accept in time, the request is marked **Expired** and cannot be accepted. The expiry job checks every 10 seconds.
- **Future bookings:** Requests scheduled for a later calendar day do not get the 15-minute expiry.
- **Arrival check:** Before accepting a same-day request, the server estimates travel time from the stored distance at 30 km/h, adds a 15-minute buffer, and checks that the provider can arrive by the scheduled time. If not, acceptance is blocked and the provider is prompted to request a schedule adjustment.
- **Provider interface:** The incoming request shows its countdown and disables **Accept** when the request has expired or the arrival window has passed. The server remains authoritative for both checks.
