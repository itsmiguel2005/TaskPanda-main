# TaskPanda — Codebase Overview

## Summary

TaskPanda is a full-stack, on-demand **local skill & service marketplace** for the Philippines. It connects residential/commercial **clients** with nearby **service providers** (plumbers, electricians, aircon techs, carpenters, welders, IT repair techs, etc.), and includes a **System Administrator** back-office. The app handles email-verified registration, role-based dashboards, geolocation-based provider discovery, an offer/counter-offer booking lifecycle, real-time-ish chat tied to bookings, a cash-on-completion settlement + digital-receipt flow, a two-round revision/dispute system, a star rating/review system, and Web-Push notifications.

The proposal document (attached by the user) describes the original scope. The codebase has **significantly outgrown it**. Features that exist in code but are **not** in the proposal: location/geo-distance provider matching, in-booking live chat, offer/counter-offer negotiation, cancellation with grace periods & approval windows, a two-round revision system with provider dispute escalation, a cash-settlement + digital-receipt flow with auto-settlement fallback, OneSignal Web Push, Cloudinary chat-photo uploads, TESDA certificate filtering, admin analytics, favorites, conversation archiving/reporting, and a hardened admin login with email OTP. Conversely, the proposal's "direct or cash-on-completion" framing is implemented strictly as **cash-only** (no payment gateway, no GPS tracking) — matching the stated non-goals.

## Architecture

- **Pattern:** Classic three-tier client/server. A React SPA (Vite-built) talks to a stateless Express REST API over `/api/*`; MongoDB (via Mongoose) is the only datastore. The same Express app serves the built SPA in production (`backend/app.js` serves `../dist`).
- **Deployment:** Designed for **Vercel**. `api/index.js` re-exports the Express app as a serverless function; `vercel.json` rewrites `/api/:path*` to the function and everything else to `/index.html`, and applies CSP/HSTS/security headers to static responses. Locally, Vite proxies `/api` and `/uploads` to `http://localhost:3000`.
- **Runtime entry points:**
  - Local server: `backend/server.js` — connects Mongo, starts a **1-minute `setInterval`** that runs `processCashSettlementFallbacks()` (auto-settles stale cash bookings), then `app.listen(port)`.
  - Serverless: `api/index.js` → `require("../backend/app")`. No interval runs on serverless; auto-settlement only happens on the long-running server.
- **Frontend runtime:** `frontend/src/main.jsx` mounts `<App/>` inside `<BrowserRouter>`. `App.jsx` wraps everything in `<AuthProvider>` → `<BookingProvider>` → `<ErrorBoundary>`, declares all routes, and conditionally renders `<CommunityImpactBanner/>` + `<Footer/>` (hidden on auth routes and messages routes).
- **Tech stack:** Node.js + Express 5, Mongoose 9 (MongoDB), bcryptjs, express-validator, express-rate-limit, helmet, express-mongo-sanitize, multer, nodemailer, cloudinary, react 19, react-router-dom 7, recharts, react-onesignal 3, tailwindcss 3. The project is `"type": "commonjs"` — the backend is CommonJS (`require`), while the frontend is ESM (`import`).
- **Primary runtime loop:** There is **no polling loop in the backend** except the cash-settlement interval. The frontend instead polls aggressively: `BookingContext` refetches bookings every 10 s, `LiveChatLayout` polls conversations every 4 s and the open thread every 2.5 s, `Header` polls unread counts every 8 s, and the admin dashboard refreshes every 60 s. There is no websocket layer.

## Directory Structure

```
TaskPanda-main/
├── api/
│   └── index.js              — Vercel serverless entry; re-exports the Express app
├── backend/
│   ├── app.js                — Express app: middleware chain, route mounting, DB-per-request
│   ├── server.js             — Local HTTP server + cash-settlement interval
│   ├── db.js                 — Mongoose connection singleton (sanitizeFilter, strictQuery)
│   ├── config/env.js         — Env parsing: Mongo, SMTP, OneSignal, CORS, app URL, proxy trust
│   ├── controllers/          — Request handlers (auth, booking, message, provider, admin, profile, favorite)
│   ├── models/               — Mongoose schemas (User, Booking, Conversation, Message, Favorite, admin-security)
│   ├── routes/               — Express routers per feature area
│   ├── middleware/           — requireAuth, requireAdmin, rateLimits, authAttempts, sanitizeMongoInput, validateRequest
│   ├── services/             — bookingMessaging, oneSignal, mailer, geocoder, cloudinaryMedia, adminLoginSecurity
│   └── storage/              — Multer configs: disk (upload), memory (chat photo, profile photo)
├── frontend/
│   ├── index.html            — Vite HTML entry (root of the Vite project)
│   ├── public/               — OneSignalSDKWorker.js + mascot assets
│   └── src/
│       ├── main.jsx / App.jsx — Mount + all routes + providers + error boundary
│       ├── context/          — AuthContext (session/role), BookingContext (booking store + mutations)
│       ├── services/         — oneSignal.js (client SDK wrapper)
│       ├── utils/            — bookingCancellation, registrationDraft helpers
│       ├── components/       — ~26 UI components (dashboards, modals, chat layout, pickers)
│       └── pages/            — ~32 route pages (auth, registration wizard, dashboards, info pages)
├── scripts/                  — Health check, CSS check, backfills (ratings, geolocations), upload test
├── dist/                     — Generated production frontend build (served by Express)
├── uploads/                  — Local disk storage for booking/ID/review photos
└── vercel.json / vite.config.mjs / tailwind.config.js / postcss.config.js
```

## Key Abstractions

### User (Mongoose model)
- **File:** `backend/models/User.js`
- **Responsibility:** Single collection for **all three roles** (`client`/`provider`/`admin`-ish). Stores identity (`role`, `email`, `passwordHash`), name parts, Philippine address fields (`province`/`city`/`barangay`/`address`), a GeoJSON `geoLocation` Point (2dsphere-indexed), professions array, bio, `profileImage` URL, denormalized `averageRating`/`totalReviews`, `tesdaCertificates` (trade + status pending/approved/rejected), and `dateOfBirth`.
- **Token design (non-obvious):** Auth tokens are **stored as hashes, not JWTs**. The doc holds multiple token arrays — `accountTokens` (login sessions, 30-day), `emailVerificationTokens`, `onboardingTokens` — each `{ tokenHash, expiresAt }` capped with `$slice: -5`. Several token/reset fields are `select: false`, so they must be explicitly `.select("+field")`-ed.
- **Used by:** every controller.

### Booking (Mongoose model)
- **File:** `backend/models/Booking.js`
- **Responsibility:** The core transactional aggregate. Holds `clientId`/`providerId`, `repairDescription`, `address`, `photoUrl`, `urgency` (`Emergency`/`Flexible`), `serviceDate`, `timeSlot` (fixed enum of 7 slots), `offeredPrice` (min ₱100), `paymentMethod` (always `cash`), the cash-confirmation fields, `cashReceipt` sub-object, completion proof (`completionNote`/`completionPhotos`), `revisionRequests[]`, `counterOffers[]`, `providerUpdates[]`, `status`, cancellation fields, `clientRating`/`clientReview`, and `statusHistory[]`.
- **Key indices:** client/provider + `createdAt`; and a **partial unique index** on `(providerId, serviceDate, timeSlot)` scoped to active statuses — the DB-level guarantee against double-booking a slot.
- **Non-obvious:** `status` enum contains **both** snake_case codes and legacy Title-Case labels (`"Pending Request"`, `"Confirmed"`, …). The controller normalizes on read but writes may still carry old labels, so most queries pass both variants.

### Booking controller
- **File:** `backend/controllers/bookingController.js` (largest controller)
- **Responsibility:** The entire booking state machine — create, list, availability, status transitions, completion proof, revisions, cancellations, reviews, provider schedule updates, counter-offers, and the auto-settlement fallback.
- **Interface highlights:** `handleCreateBooking`, `handleUpdateBookingStatus` (provider only; enforces allowed previous statuses), `handleSubmitCompletion`, `handleCreateRevisionRequest`/`handleRespondToRevision`, `handleCancellation`, `handleBookingReview`, `handleProviderUpdate`/`handleProviderUpdateResponse`, `handleCreateCounterOffer`/`handleRespondToCounterOffer`, `processCashSettlementFallbacks`.
- **Non-obvious:** `serializeBooking()` is the single serializer that emits **both** legacy and modern field names (`task`/`description`/`repairDescription`, `price`/`offer`/`offeredPrice`, `date`/`serviceDate`, `status`/`statusCode`) so old and new UI code both work. Controllers also accept many request-body aliases (`repairDescription || description || task || serviceDetails`).

### requireAuth / requireAdmin (middleware)
- **File:** `backend/middleware/requireAuth.js`, `backend/middleware/requireAdmin.js`
- **Responsibility:** Opaque-bearer-token auth. `requireAuth` hashes the `Authorization: Bearer <64-hex>` token and looks for a matching non-expired entry in `accountTokens` with `registrationComplete: true`; attaches `req.user`. `requireRole(...roles)` gates by role. `requireAdmin` verifies against the separate `AdminSession` collection.
- **Non-obvious:** Token format is validated by regex `/^[a-f\d]{64}$/i` **before** any DB hit; invalid-format tokens never touch Mongo.

### AuthContext / BookingContext (React)
- **File:** `frontend/src/context/AuthContext.jsx`, `frontend/src/context/BookingContext.jsx`
- **Responsibility:** `AuthContext` is the app-wide session store: reads persisted auth from `localStorage`/`sessionStorage` under key `taskpanda_auth`, exposes `login`/`logout`/`verify`/`updateUser`/`refreshProfile`, syncs OneSignal identity on login/logout, and auto-refreshes the profile on mount. `BookingContext` is the client-side mirror of the booking list: fetches `/api/bookings` every 10 s, exposes all mutation helpers (`createBooking`, `updateBookingStatus`, `submitCompletionProof`, `requestRevision`, `requestCancellation`, `submitReview`, counter/provider-update responders, `confirmCashSettlement`), and broadcasts a `taskpanda:data-sync` window event when data changes.
- **Non-obvious:** `BookingContext` uses a **snapshot-compare** (`JSON.stringify` before/after) to avoid needless re-renders, and dispatches custom window events (`taskpanda:data-sync`, `taskpanda:favorites-sync`, `taskpanda:conversation-read`) to coordinate components without a global store.

### LiveChatLayout
- **File:** `frontend/src/components/LiveChatLayout.jsx`
- **Responsibility:** The shared messaging UI for both client and provider (`role` prop). Owns conversation list, message thread, pagination, photo attachments, and inline booking actions (approve/decline/counter/status-change/cancel/revision/review/cash-confirm) surfaced through "system message" cards.
- **Non-obvious:** Very large single component. Uses cursor pagination (`before`/`beforeId`), preserves scroll position when prepending older messages via a `useLayoutEffect` scroll-delta trick, and gates "send" on archived state. Used by `MessagesPage` and `ProviderMessagesPage`.

### bookingMessaging service
- **File:** `backend/services/bookingMessaging.js`
- **Responsibility:** The single write path for **system messages**. `ensureBookingConversation(booking)` lazily creates one Conversation per booking and seeds it with a "New Booking Request" summary; `appendBookingSystemMessage(...)` appends a `Message` with `senderRole: "system"` and an `eventType`/`eventData` payload, updates `lastMessage`, and increments the correct unread counter.
- **Non-obvious:** Every booking event in the system is delivered as **chat**: approvals, cancellations, counter-offers, revisions, payments, receipts, and reviews all become system messages. This couples the chat subsystem to essentially every other feature.

### OneSignal service (server + client)
- **File:** `backend/services/oneSignal.js`, `frontend/src/services/oneSignal.js`
- **Responsibility:** Server-side push via the OneSignal REST API; client SDK wrapper for identity + permission prompts. Users are identified by Mongo user id as the OneSignal External ID, with a `role` tag (`client`/`provider`/`admin`). `sendPushNotification` targets **either** explicit `userIds` (external IDs) **or** role filters — never both.
- **Non-obvious:** Admin notifications are targeted by the `role=admin` tag; admins use a pseudo external-id `admin:<email>`. The code treats role tags as delivery segmentation only (DB auth is separate).

### cloudinaryMedia service
- **File:** `backend/services/cloudinaryMedia.js`
- **Responsibility:** Chat-photo (authenticated image type) and profile-photo (public) uploads. `uploadChatPhoto` builds a **predictable public-id prefix** `taskpanda_chat_<conversationId>_<userId>_<uuid>`; `isOwnedChatPhotoPublicId` re-derives and validates that prefix so ownership can be proven without a DB read.
- **Non-obvious:** Chat photos are stored as `authenticated` Cloudinary assets and served only via the backend proxy route `GET /api/messages/:conversationId/:messageId/photos/:photoIndex`, which checks conversation membership and re-signs the URL. Only when the message is persisted is the ownership/belonging flow complete; abandoned uploads are cleaned via `/api/messages/photos/cleanup`.

### adminLoginSecurity service
- **File:** `backend/services/adminLoginSecurity.js`
- **Responsibility:** Admin 2FA primitives: 6-digit code generation, HMAC-SHA256 code hashing (keyed by `ADMIN_OTP_SECRET`), challenge-token hashing, timing-safe hex compare, and a **MongoDB-backed fixed-window rate limiter** (`consumeAdminRateLimit`) that is shared across serverless instances.
- **Non-obvious:** Unlike the in-memory `authAttempts` lock (per-process), the admin rate limiter is DB-backed specifically so it survives/coordinates across serverless instances.
## Data Flow

### A. Registration → Verification → Onboarding (3-phase, email-gated)
1. `RegisterPage` → role choice → `WorkerRegisterPage` (provider, 5-step wizard) or `ClientRegisterPage` (client, shorter wizard). Providers pick professions via `ProfessionSelector` and location via `PHLocationPicker` (dynamically imports `ph-addresses-locations`).
2. Step 1 posts to `POST /api/auth/register` with `registrationPhase: "start"` → `handleRegister` creates a User with `emailVerified:false, registrationComplete:false`, sets a **registration-session cookie** (`taskpanda_registration`, HttpOnly, SameSite=Lax, 7-day), and emails a verification link.
3. The user opens the email link → `VerifyEmailPage` calls `POST /api/auth/verify-email` with the token → sets `emailVerified:true` and issues a short-lived **onboardingToken**. Cross-tab resumption uses `BroadcastChannel` + a `localStorage` signal + `sendBeacon` on tab close.
4. The wizard's final step (`WorkerRegisterPhone` / `ClientRegisterPhone`) POSTs `POST /api/auth/complete-registration` with `Authorization: Bearer <onboardingToken>` and the assembled step data. The server validates, geocodes the address (via `geocoder.js` / Nominatim), enforces provider rules (18+, geoLocation required, ≥1 profession), sets `registrationComplete:true`, clears all onboarding/registration token fields, and returns a fresh **account token**.
5. Provider-only rules are enforced server-side in `handleCompleteRegistration` (age computed from DOB, geoLocation presence, professions length).

### B. Provider discovery (geo search)
1. `Explore.jsx` (or `ClientDashboard`) obtains the client's `geoLocation` (from profile or a "use current location" retry loop).
2. It calls `GET /api/providers?longitude&latitude&minKm&maxKm&q&categories&credential` → `handleDiscoverProviders` runs a `$geoNear` aggregation (max 100 km) with optional regex category/credential filters, then a `$facet` for total + paginated projection with a computed `distanceKm`.
3. Results render as cards; favorites are toggled via `POST/DELETE /api/client/favorites`.

### C. Booking lifecycle (the central flow)
1. Client clicks **Book** on a provider → `RequestBookingModal` (2 steps). Step 2 fetches availability from `GET /api/bookings/availability/:providerId` (polled every 5 s) and lets the client pick a date from a custom calendar + one of the 7 fixed time slots, choose urgency, and enter an offer (≥₱100, cash only), and accept terms.
2. `BookingContext.createBooking` posts multipart `POST /api/bookings` → `handleCreateBooking` validates, checks past-date/past-slot, checks conflicts, creates the booking with `status:"pending"`, calls `ensureBookingConversation` (seeds the chat), and pushes notifications (provider; plus admin for Emergency). A partial unique index is the final guard against slot races.
3. Provider dashboard (`ProviderDashboard`) shows the request; provider Accepts (`PATCH /:id/status` → `approved`), Declines (`declined`), or Counter-offers (`POST /:id/counter-offers`). Client responds (`PATCH /:id/counter-offers/:counterOfferId`).
4. Status progression (`approved` → `en_route` → `in_progress` → `complete`) is provider-driven and each transition enforces an allowed previous status. Every transition appends a system chat message + push notification.
5. Provider submits completion via `CompletionProofModal` → `POST /:id/completion` (note + up to 5 photos) → `status:"complete"`.
6. Client may **request a revision** (`POST /:id/revisions`, max 2 cycles) → `status:"in_revision"`; provider accepts (fix & resubmit) or disputes → `status:"disputed"` (admin alert).
7. **Settlement:** After `complete`, cash settlement is confirmed in chat via `PATCH /api/conversations/:id/payment` (`cash_paid` by client, then `cash_received` by provider). When **both** are confirmed, a **digital receipt** is generated, `status` becomes `settled`. If the client never confirms within 48 h, `processCashSettlementFallbacks()` auto-settles.
8. Client submits a star review (`POST /:id/rate`) once settled; `recalculateProviderRatingSummary` aggregates completed+rated bookings into `User.averageRating`/`totalReviews`.

### D. Messaging & system events
1. Messages are read via `GET /api/messages/:conversationId` (cursor pagination, auto-marks read) and sent via `POST /api/messages`.
2. Photos: client uploads each file to `POST /api/messages/photos` (memory multer → Cloudinary authenticated) then sends `POST /api/messages` with `photos:[{publicId}]`; display goes through the membership-checked proxy route.
3. System message cards (`SystemMessageCard`) render event types and expose inline action buttons (accept/decline/counter/cancel/revision/review) which post back to the booking/cancellation endpoints.

### E. Admin
1. Admin login (`LoginPage`) → `POST /api/auth/login` with the configured `ADMIN_EMAIL` → returns `requiresAdminOtp` + challenge token; a 6-digit code is emailed. `POST /api/auth/admin-login/verify` issues an **8-hour** `AdminSession` token (separate from user tokens).
2. `AdminDashboardPage` renders `AdminDashboardOverview` (lazy-loaded, embeds recharts) which calls `GET /api/admin/analytics` (guarded by `requireAdmin`) for live totals, 30-day booking trend, top categories, recent bookings, and system health.

## Non-Obvious Behaviors & Design Decisions

- **No JWTs.** Despite the proposal implying sessions, auth is opaque 64-hex bearer tokens stored **hashed** on the user/admin docs. `README` is explicit: "this app does not use JWTs or require a `JWT_SECRET`". Multiple tokens per user are supported (up to 5) for multi-device login; expiry is 30 days (admin: 8 hours).
- **DB is connected per-request on `/api`.** `backend/app.js` mounts an `async` middleware on `/api` that `await connectDB()` on every request (a memoized promise in `db.js`). The serverless function is therefore stateless and cheap; the local server also connects eagerly at boot.
- **Status dual-representation is a live hazard.** `Booking.status` can legitimately be snake_case **or** Title Case, and many queries pass both. Any new query must account for this or it will silently miss records. Similarly, `serializeBooking` emits many duplicate field names for backward compatibility.
- **Money is cash-only, end to end.** `paymentMethod` is a single-value enum (`cash`); the create route rejects anything else. "Digital receipt" is a generated record, not a payment. This matches the proposal's explicit non-goal.
- **Auto-settlement only runs on the long-lived server.** `processCashSettlementFallbacks` is scheduled in `server.js` (1-minute interval) but **not** in the serverless path — on Vercel, bookings only auto-settle if/when that code path is invoked. This is a deployment-dependent behavior worth knowing.
- **Time-zone handling is a minefield.** `serviceDate` is stored as a UTC-midnight date; slot times use a `+8` PH offset in `cancellationResponseWindow`/`isServiceSlotInPast`, but `handleCreateBooking`'s "past slot" check uses **server-local** `today.getHours()`, and serialization formats the date with `timeZone:"UTC"`. Different code paths assume different zones; treat scheduling changes with care.
- **Two parallel cancellation-lock constants.** Backend `GRACE_PERIOD_MS = 10 min` (instant cancel before it, else request+approval) and `CASH_SETTLEMENT_GRACE_MS = 48 h`. The frontend mirrors the 10-minute rule in `utils/bookingCancellation.js`. Cancellation *response windows* scale with proximity to service (2 h / 6 h / 24 h).
- **Signup is not instant.** A user can hold an unverified, incomplete account; if `registrationExpiresAt` (7 days) passes it is deleted on next register attempt. Login branches into `requiresEmailVerification`, `requiresRegistrationCompletion`, and `requiresAdminOtp` states, each handled by the UI.
- **Login lockout is in-memory and per-process.** `authAttempts.js` locks an identifier after 3/4/5 failed attempts (1 min / 3 min / ∞), but the map is not shared across serverless instances — a real limitation the README also flags for the express-rate-limit store.
- **Role tags in OneSignal are not authorization.** Pushes are segmented by `role` tag, but all authorization is enforced server-side by `requireAuth`/`requireRole`/`requireAdmin` and participant checks.
- **Frontend relies on polling + window events, not websockets.** Multiple independent intervals (bookings 10 s, chat 2.5–4 s, unread 8 s, admin 60 s) drive freshness; `taskpanda:*` custom events keep components in sync. This means the UI can momentarily show stale state and puts steady load on the API.
- **Provider "rating" is computed in three places.** `User.averageRating`/`totalReviews` are the source of truth, recomputed on review and by the `backfill:provider-ratings` script. But `ClientDashboard`/`ProviderDashboard` also derive a rating locally from the bookings list as a fallback when the backend summary is empty. Expect the two to disagree until backfill runs.
- **Chat photos are "orphan-cleaned", not transactional.** Upload happens before the message is sent; if send fails, the client calls `/photos/cleanup`. Untracked uploads can linger if the browser closes mid-flow.
- **Some admin UI is still mock.** `AdminDashboardPage` (users/verifications/bookings tabs) uses hard-coded arrays and `console.log` handlers; only the `dashboard` section (`AdminDashboardOverview`) hits the real API. Real verification approval endpoints do not exist yet — the `POST /api/verify` route only acknowledges uploads.
- **`PHLocationPicker` lazy-imports a location dataset** (`ph-addresses-locations`) client-side, while the backend separately geocodes full addresses server-side via OpenStreetMap/Nominatim (rate-limited to ~1 req/s in backfill).
- **Uploaded booking/ID/review photos go to local disk** (`/uploads`), which is **ephemeral on Vercel** — only chat photos and profile photos use Cloudinary. This is a latent production limitation.
- **Extensive input aliasing.** Controllers accept an unusual number of field aliases (`providerId || provider`, `date || serviceDate`, `offer || offeredPrice || price`, etc.) plus `statusCode`/`status` and `time`/`timeSlot`. When editing, follow the existing alias pattern rather than replacing it.
- **Hardened error responses.** Unexpected errors return generic messages; stack traces are only included when `NODE_ENV !== "production"`. `mongoose.trusted()` is wrapped around user-influenced `$gt`/`$in`/`$elemMatch` filters to satisfy `sanitizeFilter`.

## Module Reference

| File | Purpose |
|------|---------|
| `backend/app.js` | Express app: body limits, per-request DB connect, static + `/uploads`, mounts all routers, SPA fallback |
| `backend/server.js` | Local server bootstrap + 1-minute cash-settlement interval |
| `backend/db.js` | Memoized Mongoose connection; enables `sanitizeFilter` + `strictQuery` |
| `backend/config/env.js` | Parses/configures Mongo, SMTP, OneSignal, CORS origins, proxy trust, app URL |
| `backend/controllers/authController.js` | Register/verify/complete-registration/login/admin-OTP/forgot+reset password |
| `backend/controllers/bookingController.js` | Full booking state machine, serializer, reviews, revisions, counter-offers, auto-settlement |
| `backend/controllers/messageController.js` | Conversations, messages, chat photos, cash confirmation, archive, support reports |
| `backend/controllers/providerController.js` | Geo provider discovery (`$geoNear` + `$facet`) |
| `backend/controllers/adminController.js` | Admin analytics aggregation |
| `backend/controllers/profileController.js` | Profile get/update + profile-photo upload |
| `backend/controllers/favoriteController.js` | Client favorites CRUD |
| `backend/middleware/requireAuth.js` | Bearer-token user auth + `requireRole` |
| `backend/middleware/requireAdmin.js` | Admin session auth |
| `backend/middleware/rateLimits.js` | express-rate-limit configs per route class |
| `backend/middleware/authAttempts.js` | In-memory login lockout ladder |
| `backend/middleware/sanitizeMongoInput.js` | Express-5-compatible mongo-sanitize adapter |
| `backend/middleware/validateRequest.js` | express-validator result → first-error 400 |
| `backend/services/bookingMessaging.js` | Conversation ensure + system-message append |
| `backend/services/oneSignal.js` | Server push (external-id or role targeting) |
| `backend/services/mailer.js` | Nodemailer: verification, password reset, admin OTP emails |
| `backend/services/geocoder.js` | Nominatim geocoding for addresses |
| `backend/services/cloudinaryMedia.js` | Profile/chat photo upload, ownership checks, signed delivery |
| `backend/services/adminLoginSecurity.js` | Admin code hashing + DB-backed rate limiter |
| `backend/models/User.js` | Users (all roles), tokens, geo, ratings, professions |
| `backend/models/Booking.js` | Booking aggregate + unique slot index |
| `backend/models/Conversation.js` | Per-booking conversation, unread counts, reports |
| `backend/models/Message.js` | Chat messages incl. system events |
| `backend/models/Favorite.js` | Client↔provider favorites (unique pair) |
| `backend/models/AdminSession.js` / `AdminLoginChallenge.js` / `AdminAuthRateLimit.js` | Admin 2FA + rate-limit state |
| `frontend/src/App.jsx` | Routes, providers, error boundary, footer rules |
| `frontend/src/context/AuthContext.jsx` | Session state, persistence, OneSignal identity sync |
| `frontend/src/context/BookingContext.jsx` | Booking store + all booking mutations + sync events |
| `frontend/src/components/LiveChatLayout.jsx` | Shared chat UI with inline booking actions |
| `frontend/src/components/ClientDashboard.jsx` | Client home: categories, nearby/top-rated, favorites, active bookings |
| `frontend/src/components/ProviderDashboard.jsx` | Provider home: requests, jobs, tracker, stats, completion modal |
| `frontend/src/components/Explore.jsx` | Provider discovery with filters, distance slider, TESDA filter |
| `frontend/src/components/RequestBookingModal.jsx` | 2-step booking creation with calendar + availability |
| `frontend/src/components/AdminDashboardOverview.jsx` | Live admin analytics (recharts) |
| `frontend/src/components/SystemMessageCard.jsx` | Renders chat system events + inline actions |
| `frontend/src/components/PHLocationPicker.jsx` | PH province/city/barangay cascade + geolocation |
| `frontend/src/components/ProfessionSelector.jsx` | Multi-select profession input |
| `frontend/src/pages/*Register*` | Auth + multi-step registration wizard pages |
| `frontend/src/utils/bookingCancellation.js` | Client-side status normalize + cancellation rules |
| `scripts/backfill-provider-ratings.js` | Recompute provider rating summaries |
| `scripts/backfill-geolocations.js` | Geocode users missing `geoLocation` |
| `scripts/check-health.js` | Verify API + Mongo connectivity |

## Suggested Reading Order

1. `README.md` — authoritative on env vars, security model, deploy, and the many non-obvious operational rules. Read this first.
2. `backend/app.js` + `backend/controllers/bookingController.js` — the app wiring and the single most important file (the booking state machine + serializer). Everything else orbits this.
3. `backend/models/Booking.js` — the data contract; note the dual status enum and the partial unique slot index.
4. `backend/services/bookingMessaging.js` — understand that *every* booking event is a chat system message; this unlocks the messaging model.
5. `frontend/src/context/BookingContext.jsx` — the client-side source of truth for bookings and the mutation surface.
6. `frontend/src/components/LiveChatLayout.jsx` — the densest UI: chat + all inline booking actions; read after the context so the API calls make sense.
7. `frontend/src/components/ProviderDashboard.jsx` + `ClientDashboard.jsx` — the two role homes; together they show the full status lifecycle in the UI.

## Gaps, Risks & Things Likely To Confuse a New Developer

- **Proposal vs. reality:** The PDF is a starting point only. Do not treat it as the spec — the running app is far larger (chat, negotiation, cash settlement, receipts, revisions, push, geo-matching, favorites).
- **Two "Dashboard" components named confusingly:** `pages/ClientDashboardPage.jsx` simply renders `components/ClientDashboard.jsx` whose default export is confusingly named `Dashboard`.
- **Legacy + modern duplicated everywhere:** dual status labels and field aliases pervade models, controllers, serializers, and UI. This is deliberate backward compatibility, not cruft to delete casually.
- **Admin verification is not implemented server-side.** `POST /api/verify` only accepts uploads; the admin "approve/reject" buttons are console logs. TESDA certificates are stored but only `status` filtering (`credential=tesda` → approved certs) is wired.
- **`/uploads` durability on Vercel** and the **serverless auto-settlement gap** are the two biggest deployment risks.
- **No automated test suite** (`npm test` is a placeholder), though a few `*.test.js` files exist (`User.passwordReset.test.js`, `adminLoginSecurity.test.js`, `oneSignal.test.js`) and appear to be run manually.
