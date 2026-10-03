# TaskPanda — Codebase Overview

> Saved to **`project_info__1.md`** in the project root.

## Summary

TaskPanda is a full-stack, on-demand **local skill & service marketplace** for the Philippines. It connects residential/commercial **clients** with nearby **service providers** (plumbers, electricians, aircon techs, carpenters, welders, IT repair techs, etc.), plus a **System Administrator** back-office. It handles email-verified registration, role-based dashboards, geolocation-based provider discovery, an offer/counter-offer booking lifecycle, chat tied to bookings, a cash-on-completion settlement + digital-receipt flow, a two-round revision/dispute system, a star rating system, and Web-Push notifications.

Your proposal PDF describes the original scope; the codebase has **significantly outgrown it**. Features in code but **not** in the proposal: geo-distance provider matching, in-booking live chat, offer/counter-offer negotiation, cancellations with grace periods & approval windows, a two-round revision system with provider dispute escalation, a cash-settlement + digital-receipt flow with auto-settlement fallback, OneSignal Web Push, Cloudinary chat-photo uploads, TESDA-certificate filtering, admin analytics, favorites, conversation archiving/reporting, and a hardened admin login with email OTP. The proposal's "cash-on-completion" framing is implemented strictly as **cash-only** (no gateway, no GPS tracking), matching the stated non-goals.

## Architecture

- **Pattern:** Three-tier client/server. A React SPA (Vite) talks to a stateless Express REST API over `/api/*`; MongoDB (Mongoose) is the only datastore. In production the same Express app serves the built SPA.
- **Deployment:** Built for **Vercel**. `api/index.js` re-exports the Express app as a serverless function; `vercel.json` rewrites `/api/:path*` to it and everything else to `/index.html`, applying CSP/HSTS headers. Locally, Vite proxies `/api` + `/uploads` to `http://localhost:3000`.
- **Runtime entry points:**
  - Local: `backend/server.js` — connects Mongo, starts a **1-minute interval** running `processCashSettlementFallbacks()`, then `app.listen`.
  - Serverless: `api/index.js` → `require("../backend/app")`. **No interval runs on serverless.**
- **Frontend runtime:** `main.jsx` mounts `<App/>` in `<BrowserRouter>`; `App.jsx` wraps everything in `<AuthProvider>` → `<BookingProvider>` → `<ErrorBoundary>`, declares routes, and conditionally renders the community banner + footer.
- **Stack:** Node/Express 5, Mongoose 9, bcryptjs, express-validator, express-rate-limit, helmet, express-mongo-sanitize, multer, nodemailer, cloudinary; React 19, react-router-dom 7, recharts, react-onesignal 3, Tailwind 3. Backend is **CommonJS**, frontend is **ESM**.
- **Runtime loop:** No backend polling except the settlement interval. The frontend polls: bookings 10 s, chat 2.5–4 s, unread 8 s, admin 60 s. No websockets.

## Directory Structure

```
TaskPanda-main/
├── api/index.js              — Vercel serverless entry; re-exports the Express app
├── backend/
│   ├── app.js                — Express middleware chain, route mounting, DB-per-request
│   ├── server.js             — Local HTTP server + cash-settlement interval
│   ├── db.js                 — Memoized Mongoose connection (sanitizeFilter, strictQuery)
│   ├── config/env.js         — Env parsing: Mongo, SMTP, OneSignal, CORS, app URL, proxy trust
│   ├── controllers/          — auth, booking, message, provider, admin, profile, favorite
│   ├── models/               — User, Booking, Conversation, Message, Favorite, admin-security
│   ├── routes/               — Express routers per feature area
│   ├── middleware/           — requireAuth, requireAdmin, rateLimits, authAttempts, sanitize, validate
│   ├── services/             — bookingMessaging, oneSignal, mailer, geocoder, cloudinaryMedia, adminLoginSecurity
│   └── storage/              — Multer configs (disk + memory uploads)
├── frontend/
│   ├── index.html            — Vite HTML entry
│   ├── public/               — OneSignalSDKWorker.js + mascot assets
│   └── src/
│       ├── main.jsx / App.jsx — Mount + routes + providers + error boundary
│       ├── context/          — AuthContext, BookingContext
│       ├── services/         — oneSignal.js (client SDK)
│       ├── utils/            — bookingCancellation, registrationDraft
│       ├── components/       — ~26 UI components (dashboards, modals, chat, pickers)
│       └── pages/            — ~32 route pages (auth, registration wizard, dashboards, info)
├── scripts/                  — Health, CSS, upload checks; rating & geolocation backfills
├── dist/                     — Generated production build (served by Express)
├── uploads/                  — Local disk storage for booking/ID/review photos
└── vercel.json / vite.config.mjs / tailwind.config.js / postcss.config.js
```

## Key Abstractions

**User** (`backend/models/User.js`) — One collection for all three roles: identity, name parts, PH address fields, a GeoJSON `geoLocation` Point (2dsphere-indexed), professions, bio, `profileImage`, denormalized `averageRating`/`totalReviews`, `tesdaCertificates`, `dateOfBirth`. Non-obvious: tokens are **stored hashed, not JWTs** — arrays `accountTokens`/`emailVerificationTokens`/`onboardingTokens` hold `{tokenHash, expiresAt}` capped at 5; several fields are `select:false`.

**Booking** (`backend/models/Booking.js`) — The core aggregate: parties, description, address, urgency, serviceDate, fixed 7-slot timeSlot enum, offeredPrice (≥₱100), cash-only payment, cash-confirmation fields, `cashReceipt`, completion proof, `revisionRequests[]`, `counterOffers[]`, `providerUpdates[]`, `status`, cancellation fields, review, `statusHistory[]`. Non-obvious: a **partial unique index** on `(providerId, serviceDate, timeSlot)` is the DB-level guard against double-booking; the `status` enum contains **both** snake_case codes and legacy Title-Case labels.

**Booking controller** (`backend/controllers/bookingController.js`, largest) — The entire state machine: create, list, availability, status transitions, completion, revisions, cancellations, reviews, provider updates, counter-offers, auto-settlement. `serializeBooking()` emits **both** legacy and modern field names (`task`/`description`/`repairDescription`, `price`/`offer`/`offeredPrice`, `date`/`serviceDate`, `status`/`statusCode`); controllers accept many aliases.

**requireAuth / requireAdmin** (`backend/middleware/`) — Opaque-bearer auth. `requireAuth` hashes the 64-hex token and matches a non-expired `accountTokens` entry with `registrationComplete:true`; `requireRole` gates by role; `requireAdmin` checks `AdminSession`. Token format is regex-validated **before** any DB hit.

**AuthContext / BookingContext** (`frontend/src/context/`) — Session store (persisted under `taskpanda_auth`) with login/logout/verify/updateUser/refreshProfile + OneSignal identity sync; booking store fetched every 10 s with all mutations, broadcasting `taskpanda:data-sync`. Uses snapshot-compare to avoid re-renders and custom window events instead of a global store.

**LiveChatLayout** (`frontend/src/components/LiveChatLayout.jsx`) — Shared messaging UI for both roles: conversation list, thread, cursor pagination, photo attachments, and inline booking actions via system-message cards. Preserves scroll on prepending older messages via a `useLayoutEffect` delta trick.

**bookingMessaging service** (`backend/services/bookingMessaging.js`) — The single write path for **system messages**; lazily creates one Conversation per booking and appends `senderRole:"system"` Messages with `eventType`/`eventData`. Non-obvious: **every booking event becomes chat**, coupling chat to nearly every feature.

**OneSignal service** (`backend/services/oneSignal.js`, `frontend/src/services/oneSignal.js`) — Server push via REST; client SDK wrapper. Users identified by Mongo id as External ID with a `role` tag; admins use `admin:<email>`. Pushes target **either** explicit user IDs **or** role filters, never both. Role tags are delivery segmentation only, never authorization.

**cloudinaryMedia service** (`backend/services/cloudinaryMedia.js`) — Chat photos (authenticated type) + profile photos (public). Chat public-ids follow `taskpanda_chat_<conversationId>_<userId>_<uuid>`, so ownership is proven from the id; chat photos are served only via a membership-checked backend proxy route, with orphan cleanup.

**adminLoginSecurity service** (`backend/services/adminLoginSecurity.js`) — Admin 2FA primitives plus a **MongoDB-backed** fixed-window rate limiter shared across serverless instances (unlike the in-memory login lock).

## Data Flow

**A. Registration → Verification → Onboarding (email-gated):** Register → role choice → provider 5-step wizard / client wizard → `POST /api/auth/register` (`registrationPhase:"start"`, sets a registration cookie, emails link) → email link → `POST /api/auth/verify-email` (sets `emailVerified`, issues onboardingToken; cross-tab via BroadcastChannel + sendBeacon) → final step → `POST /api/auth/complete-registration` (geocodes, enforces 18+/geo/professions for providers, returns account token).

**B. Provider discovery (geo):** Client coordinates → `GET /api/providers?...` → `$geoNear` (max 100 km) + `$facet` for total + paginated results with computed `distanceKm`.

**C. Booking lifecycle (central flow):** Book via `RequestBookingModal` (2 steps, availability polled 5 s) → `POST /api/bookings` creates `pending`, seeds chat, notifies → provider Accept/Decline/Counter → status `approved → en_route → in_progress → complete` (each transition enforces prior status + system chat message + push) → completion proof (`POST /:id/completion`) → optional revisions (max 2, dispute escalates to admin) → cash settlement in chat (`cash_paid` then `cash_received`) → digital receipt + `settled` (auto-settled after 48 h by the interval) → star review recomputes provider rating.

**D. Messaging:** Read `GET /api/messages/:conversationId` (cursor pagination, auto-mark-read); send `POST /api/messages`; photos upload separately to Cloudinary then attach by `publicId`; `SystemMessageCard` renders events with inline actions.

**E. Admin:** `POST /api/auth/login` with `ADMIN_EMAIL` → OTP email → `POST /api/auth/admin-login/verify` issues an **8-hour** session → `GET /api/admin/analytics` powers the recharts dashboard.

## Non-Obvious Behaviors & Design Decisions

- **No JWTs.** Auth is opaque 64-hex bearer tokens stored **hashed** (up to 5 per user; 30-day expiry, admin 8 h).
- **DB connected per `/api` request** via a memoized promise — ideal for serverless.
- **Status dual-representation is a live hazard.** New queries must cover both snake_case and Title Case, or miss records.
- **Money is cash-only end to end**; the "digital receipt" is a generated record, not a payment.
- **Auto-settlement only runs on the long-lived server**, not on Vercel serverless.
- **Time-zone handling is a minefield** — some code applies a `+8` PH offset, some uses server-local hours, some formats UTC.
- **Two cancellation constants:** `GRACE_PERIOD_MS = 10 min` and `CASH_SETTLEMENT_GRACE_MS = 48 h`; response windows scale with proximity (2 h / 6 h / 24 h). The frontend mirrors the 10-minute rule.
- **Signup is not instant** — unverified/incomplete accounts expire in 7 days and are deleted on next attempt; login branches into verification / completion / admin-OTP states.
- **Login lockout is in-memory and per-process** (3/4/5 failures → 1 min / 3 min / ∞), not shared across serverless instances.
- **Frontend relies on polling + window events**, so UI can be briefly stale and steady API load is expected.
- **Provider rating is computed in three places** (the `User` summary, on-review recalculation, and a local dashboard fallback) — they can disagree until backfill runs.
- **Chat photos are orphan-cleaned, not transactional.**
- **Some admin UI is still mock** — the users/verifications/bookings tabs use hard-coded arrays and `console.log` handlers; only `dashboard` hits the real API. Real verification approval endpoints don't exist (`POST /api/verify` only acknowledges uploads).
- **Uploaded booking/ID/review photos go to local disk** (`/uploads`) — **ephemeral on Vercel**; only chat + profile photos use Cloudinary.
- **Extensive input aliasing** across controllers — follow the pattern rather than replacing it.
- **Hardened errors** with `mongoose.trusted()` guarding user-influenced filters; stacks only when not in production.

## Module Reference

Key files: `backend/app.js` (wiring), `backend/server.js` (bootstrap + interval), `backend/db.js`, `backend/config/env.js`, `backend/controllers/{auth,booking,message,provider,admin,profile,favorite}Controller.js`, `backend/middleware/{requireAuth,requireAdmin,rateLimits,authAttempts,sanitizeMongoInput,validateRequest}.js`, `backend/services/{bookingMessaging,oneSignal,mailer,geocoder,cloudinaryMedia,adminLoginSecurity}.js`, `backend/models/{User,Booking,Conversation,Message,Favorite,AdminSession,AdminLoginChallenge,AdminAuthRateLimit}.js`; `frontend/src/{App.jsx, context/AuthContext.jsx, context/BookingContext.jsx}`, `frontend/src/components/{LiveChatLayout,ClientDashboard,ProviderDashboard,Explore,RequestBookingModal,AdminDashboardOverview,SystemMessageCard,PHLocationPicker,ProfessionSelector}.jsx`, `frontend/src/utils/bookingCancellation.js`, and `scripts/{backfill-provider-ratings,backfill-geolocations,check-health}.js`. (Full annotated table is in the saved file.)

## Suggested Reading Order

1. `README.md` — env vars, security model, deploy rules.
2. `backend/app.js` + `backend/controllers/bookingController.js` — wiring + the most important file (state machine + serializer).
3. `backend/models/Booking.js` — the data contract; note the dual status enum and unique slot index.
4. `backend/services/bookingMessaging.js` — realize every booking event is a chat message.
5. `frontend/src/context/BookingContext.jsx` — client-side source of truth + mutations.
6. `frontend/src/components/LiveChatLayout.jsx` — the densest UI.
7. `frontend/src/components/ProviderDashboard.jsx` + `ClientDashboard.jsx` — the two role homes showing the full lifecycle.

## Gaps, Risks & Confusion Points

- **Proposal vs. reality:** the PDF is a starting point, not the spec.
- **Confusing naming:** `ClientDashboardPage.jsx` renders `ClientDashboard.jsx` whose default export is named `Dashboard`.
- **Legacy + modern duplicated everywhere** (dual statuses, field aliases) — deliberate compatibility.
- **Admin verification isn't implemented server-side**; TESDA certs are stored but only status-filtering is wired.
- **Biggest deployment risks:** ephemeral `/uploads` and the serverless auto-settlement gap.
- **No automated test suite** (`npm test` is a placeholder); a few `*.test.js` files appear to run manually.

I'm available for follow-ups — ask me to go deeper on the booking state machine, the chat system-message model, the auth/token flow, the geo search, or anything else.