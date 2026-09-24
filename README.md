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

Start the backend in one terminal:

```bash
npm start
```

Start the frontend in a second terminal:

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

Create a `.env` file in the project root when you need to change the database, ports, admin account, or password-reset email settings:

```env
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/taskpanda?retryWrites=true&w=majority
PORT=3000

# Optional admin login
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-this-password

# Optional SMTP settings for password-reset emails
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-app-password
MAIL_FROM=your-email@example.com
```

Do not commit `.env` or real passwords to source control. For Gmail, use an app password rather than your normal account password.

## Vercel Deployment

Import this repository into Vercel with the project root set to the folder containing `package.json`. Vercel will run `npm run build` for the frontend and deploy `api/index.js` as the Express API function. The included rewrite serves the React app for client-side routes; `/api/*` is handled by the function automatically.

Add these Environment Variables in the Vercel project settings for every environment you use:

```text
MONGO_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/taskpanda?retryWrites=true&w=majority
ADMIN_EMAIL=your-admin-email
ADMIN_PASSWORD=your-strong-admin-password
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-gmail-app-password
MAIL_FROM=your-email@example.com
```

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
| `npm run dev` | Start the Vite development server on port 5173 |
| `npm start` | Start the Express backend on port 3000 |
| `npm run build` | Build the frontend into `dist/` |
| `npm run check:health` | Verify the local API and MongoDB connection |
| `npm run preview` | Preview the Vite production build |
| `npm run watch:css` | Watch and rebuild Tailwind CSS |

## Troubleshooting

### Returning to the project later

1. Open the folder containing `package.json`.
2. Run `git pull` to get the latest code.
3. Confirm `.env` exists locally and points to the development Atlas database.
4. Run `npm install` if dependencies changed.
5. Start the backend with `npm start`.
6. Run `npm run check:health`.
7. Start the frontend with `npm run dev`.
8. Test the changed workflow locally.
9. Run `npm run build`.
10. Commit and push the change:

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

Uploaded images are stored in the `uploads/` directory and are limited to 5 MB. Supported formats are JPEG, PNG, WebP, and GIF.

## Project Structure

```text
src/       React application and components
models/    Mongoose models
index.js   Express backend and API routes
db.js      MongoDB connection
public/    Public frontend assets
dist/      Generated production frontend build
```