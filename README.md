# TaskPanda

TaskPanda is a React frontend with a Vite development server and an Express/MongoDB backend.

## Requirements

- Node.js 18 or newer
- npm
- A MongoDB Atlas cluster and connection string

## Run Locally

Open a terminal in the folder that contains `package.json` (`TaskPanda-main\TaskPanda-main`). If your terminal starts in `Downloads\TaskPanda-main`, run:

```bash
cd "TaskPanda-main"
npm install
```

If you are already in the folder containing `package.json`, skip the `cd` command.

For local development, set `MONGO_URI` in `.env` to your MongoDB Atlas connection string:

```text
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/taskpanda?retryWrites=true&w=majority
```

In Atlas, create a database user, add the IP addresses that need access under Network Access, and replace the placeholders with that user's credentials. URL-encode special characters in the username or password.

Use a separate Atlas database for development, such as `taskpanda-dev`, so test accounts and reset codes never mix with production data. Keep the production `taskpanda` URI only in Vercel's Production environment.

Start the backend and frontend together:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in a browser. The Vite server proxies `/api` requests to the backend at `http://localhost:3000`.

Confirm the backend and Atlas connection before testing the UI:

```bash
npm run check:health
```

The expected response contains `200` and `"mongo":"connected"`.

## Environment Variables

Create a `.env` file in the project root when you need to change the database, ports, admin account, email delivery, or push settings:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/taskpanda?retryWrites=true&w=majority
MONGO_DB_NAME=taskpanda
PORT=3000

# Optional admin login
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password

# Required for admin login email verification
ADMIN_OTP_EMAIL=admin-security@example.com
ADMIN_OTP_SECRET=generate-a-random-secret-of-at-least-32-characters

# SMTP sends registration verification, password reset, and admin sign-in OTP emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-app-password
MAIL_FROM=your-email@example.com
# OneSignal Web Push (keep the REST key server-side)
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_API_KEY=your-onesignal-rest-api-key
# Public OneSignal app ID used by the frontend SDK
VITE_ONESIGNAL_APP_ID=your-onesignal-app-id
# Optional public site URL for email links (recommended for custom domains)
APP_URL=https://your-taskpanda-domain.example
# Optional comma-separated trusted browser origins for cross-origin deployments
CORS_ORIGINS=http://localhost:5173,https://your-taskpanda-domain.example
# Optional trusted reverse-proxy hop count for non-Vercel deployments
TRUST_PROXY=1
```

Do not commit `.env` or real passwords to source control. For Gmail, use an app password rather than your normal account password.

### Email and Push Setup

Email verification, password reset, and admin sign-in codes use SMTP. For Gmail, use an app password and configure `SMTP_USER`, `SMTP_PASSWORD`, and `MAIL_FROM`. Password reset codes are stored only as hashes with their 10-minute expiry on the user document, consumed atomically, and delivered with a link that pre-fills the existing OTP form.

For push, create a OneSignal app and configure Web Push. Set `ONESIGNAL_APP_ID` and the server-only `ONESIGNAL_REST_API_KEY` in the root `.env`; set `VITE_ONESIGNAL_APP_ID` to the same App ID. Use the App API key from the OneSignal dashboard as `ONESIGNAL_REST_API_KEY`; the server sends it with `Authorization: Key ...`. Vite loads root `.env` but exposes only variables prefixed with `VITE_` to browser code. Configure the OneSignal site URL to match the public app origin. Web Push requires HTTPS except for `localhost`; users opt in from the app's Notifications menu.

Push users are identified with their MongoDB user ID as the OneSignal External ID and receive a `role` tag (`client`, `provider`, or `admin`) at sign-in. Booking events target the appropriate participant and link to the matching booking detail; emergency requests, revision disputes, and completed admin sign-ins also produce admin alerts. Role tags are for delivery segmentation only and must never be used as authorization.

Urgent admin broadcasts are stored for clients and providers in the in-app notification bell. OneSignal browser push is sent as an additional delivery channel when eligible subscriptions are available.

## Security Features

- **HTTP security headers:** Helmet sets a Content Security Policy and standard browser protections in Express. Vercel applies matching headers to static frontend responses, including HSTS in production.
- **CORS and proxy trust:** Cross-origin requests are allowed only from `CORS_ORIGINS`, `APP_URL`, and recognized Vercel deployment URLs. Local Vite origins are allowed outside production. Vercel proxy trust is configured automatically; other deployments can set `TRUST_PROXY` to the trusted proxy-hop count.
- **NoSQL injection defenses:** Request bodies and query data are sanitized with an Express 5-compatible `express-mongo-sanitize` adapter. Mongoose also enables `sanitizeFilter` and `strictQuery`; database filters are constructed from validated fields rather than accepting client-supplied query objects.
- **Request validation:** `express-validator` checks authentication, profile, and booking inputs. Booking, provider, conversation, revision, and offer IDs are validated before database use. Mongoose schemas enforce field types, enums, ranges, and required values.
- **Request size limits:** JSON and URL-encoded bodies are limited to 10KB, with at most 100 URL-encoded parameters. Multipart uploads are limited to 5MB per file, five files, 40 fields, 10KB per field, and 45 total parts.
- **Rate limiting:** Authentication endpoints are limited to 10 requests per IP per 15 minutes; registration availability checks to 30 per 15 minutes; booking creation to 10 per 15 minutes; and verification uploads to five per hour. Login also has account-based failed-attempt lockouts.
- **Authentication and sessions:** Passwords and reset codes are hashed with bcrypt. Email-verification and onboarding tokens are random, stored as hashes, and expire. Account sessions use random 32-byte opaque bearer tokens stored as hashes with 30-day expiry; this app does not use JWTs or require a `JWT_SECRET`. The registration-session cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.
- **Admin sign-in:** Admin credentials require a second six-digit email code sent to `ADMIN_OTP_EMAIL`. Challenges expire after five minutes, are usable once, and lock after five invalid attempts. Codes are HMAC-hashed with `ADMIN_OTP_SECRET`; admin credential, email-send, and verification limits are stored in MongoDB and shared across instances.
- **Authorization:** Server middleware restricts profile, booking, messaging, favorites, and verification routes by role. Booking and conversation handlers also check participant ownership before access or updates.
- **Safer error responses:** Unexpected server and database failures return generic messages rather than stack traces or raw database errors. Unknown `/api` paths return JSON 404 responses.

The rate limiter currently uses its default in-memory store. Limits are per application process and are not shared between separate serverless instances; use a shared store such as Redis when consistent limits across multiple instances are required.

## Vercel Deployment

Import this repository into Vercel with the project root set to the folder containing `package.json`. Vercel will run `npm run build` for the frontend and deploy `api/index.js` as the Express API function. The included rewrite serves the React app for client-side routes; `/api/*` is handled by the function automatically.

Add these Environment Variables in the Vercel project settings for every environment you use:

```text
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/taskpanda?retryWrites=true&w=majority
MONGO_DB_NAME=taskpanda
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=your-strong-admin-password
ADMIN_OTP_EMAIL=your-admin-security-email
ADMIN_OTP_SECRET=<at-least-32-random-characters>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-gmail-app-password
MAIL_FROM=your-email@example.com
ONESIGNAL_APP_ID=your-onesignal-app-id
ONESIGNAL_REST_API_KEY=your-onesignal-rest-api-key
VITE_ONESIGNAL_APP_ID=your-onesignal-app-id
APP_URL=https://your-taskpanda-domain.example
CORS_ORIGINS=https://your-taskpanda-domain.example,https://www.your-taskpanda-domain.example
```

Email verification links use `APP_URL` when configured, or Vercel's deployment URL. Locally, they point to the Vite app at `http://localhost:5173`. New registrations stay pending until the email link is confirmed; verified users must finish onboarding before they can open the app. The root `.env` supplies server-only OneSignal credentials; `VITE_ONESIGNAL_APP_ID` is a public app identifier, not a secret.

In Atlas Network Access, allow Vercel's connections. For an initial deployment this is commonly `0.0.0.0/0`, but use a private networking strategy or a narrower policy when your infrastructure supports it. Never commit the Atlas URI or other secrets.

## Production Build

Build the frontend and serve it through Express:

```bash
npm run build
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

## Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite frontend on port 5173 and Express backend on port 3000 |
| `npm start` | Start the Express backend on port 3000 |
| `npm run build` | Build the frontend into `dist/` |
| `npm run build:css` | Compile the standalone Tailwind CSS bundle |
| `npm run check:health` | Verify the local API and MongoDB connection |
| `npm run backfill:provider-ratings` | Recalculate provider ratings from completed and settled bookings |
| `npm run preview` | Preview the Vite production build |
| `npm run watch:css` | Watch and rebuild Tailwind CSS |

The frontend uses Tailwind CSS 4. Its existing JavaScript configuration is loaded from `frontend/src/input.css` to preserve the project's custom colors and content paths.

## Troubleshooting

### Returning to the project later

1. Open the folder containing `package.json`.
2. Run `git pull` to get the latest code.
3. Confirm `.env` exists locally and points to the development Atlas database.
4. Run `npm install` if dependencies changed.
5. Start the frontend and backend with `npm run dev`.
6. Run `npm run check:health` in another terminal.
7. Test the changed workflow locally.
8. Run `npm run build`.
9. Commit and push the change:

```bash
git add .
git commit -m "Describe the change"
git push origin main
```

Vercel automatically deploys pushes to `main`. Environment-variable changes require a redeploy from Vercel. Never stage `.env`.

To check the deployed API without changing code:

```bash
API_URL=https://task-panda-main.vercel.app npm run check:health
```

On Windows PowerShell, use:

```powershell
$env:API_URL = "https://task-panda-main.vercel.app"; npm run check:health
```

### Preview before production

For larger changes, create a branch and push it first:

```bash
git checkout -b feature/my-change
git push -u origin feature/my-change
```

Vercel creates a Preview deployment for the branch. Test that preview, then merge the branch into `main` when it is ready for Production.

### MongoDB connection error

Set `MONGO_URI` in `.env` or Vercel project settings to a reachable MongoDB Atlas cluster. Confirm the database user password is URL-encoded and that the deployment's network access is allowed in Atlas.

### Port already in use

Set a different backend port in `.env` with `PORT`. The Vite proxy currently targets port 3000, so update `vite.config.mjs` as well if the backend port changes.

### Uploaded files

Chat photos are uploaded by the authenticated backend to Cloudinary as authenticated images. Each photo is uploaded in its own request and limited to 4 MB to stay under the Vercel Function request-body limit; messages can contain up to five photos. Supported formats are JPEG, PNG, WebP, and GIF. The chat API checks conversation membership before upload and before returning image bytes. Add these server-side environment variables to local `.env` and Vercel Project Settings:

```env
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

Keep `CLOUDINARY_API_SECRET` out of frontend variables and source control. Other existing uploads continue to use the local `uploads/` directory; chat-photo storage does not require moving old files.

Identity verification uses multilingual (`eng+fil`) `tesseract.js` OCR with Tesseract's orientation-detection model and automatic, single-block, and sparse-text layout passes to handle varied Philippine ID designs and rotated photos, including PhilSys National ID and driver's-license layouts. The orientation model is loaded into the OCR worker explicitly so orientation detection is available alongside the LSTM recognition models. It checks the ID-front image against the applicant's profile name. Automatic verification requires OCR confidence of at least 60%, an exact match for every normalized account-name part, and at least two name parts; partial or approximate matches and OCR failures are routed for manual review. Admin approval requires viewing both ID sides and explicitly confirming that the document name matches the account name. Previously auto-approved submissions with incomplete name matches are returned to manual review on the user's next authenticated request or when the admin queue is opened. Each ID image is limited to 2 MB so that the two-image multipart request stays within the Vercel Function request-body limit.

Front and back images are stored as authenticated Cloudinary assets and can only be retrieved through the admin verification routes. Configure the same Cloudinary credentials above to enable ID submissions and secure document review. The applicant submits to `POST /api/v1/users/verify`; admins use `GET /api/v1/admin/verifications` and `PATCH /api/v1/admin/verifications/:userId`.

## Project Structure

```text
frontend/  React application, Vite entry, and public assets
backend/   Express app, controllers, routes, middleware, services, models, and database
api/       Vercel serverless entry point
scripts/   Health, CSS, and upload verification utilities
dist/      Generated production frontend build
```