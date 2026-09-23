# TaskPanda

TaskPanda is a React frontend with a Vite development server and an Express/MongoDB backend.

## Requirements

- Node.js 18 or newer
- npm
- MongoDB running locally, or a MongoDB connection string

## Run Locally

Open a terminal in the folder that contains `package.json` (`TaskPanda-main\TaskPanda-main`). If your terminal starts in `Downloads\TaskPanda-main`, run:

```bash
cd "TaskPanda-main"
npm install
```

If you are already in the folder containing `package.json`, skip the `cd` command.

Make sure MongoDB is running. The default database connection is:

```text
mongodb://localhost:27017/taskpanda
```

Start the backend in one terminal:

```bash
npm start
```

Start the frontend in a second terminal:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in a browser. The Vite server proxies `/api` requests to the backend at `http://localhost:3000`.

## Environment Variables

Create a `.env` file in the project root when you need to change the database, ports, admin account, or password-reset email settings:

```env
MONGO_URI=mongodb://localhost:27017/taskpanda
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
| `npm run preview` | Preview the Vite production build |
| `npm run watch:css` | Watch and rebuild Tailwind CSS |

## Troubleshooting

### MongoDB connection error

Start MongoDB or set `MONGO_URI` in `.env` to a reachable MongoDB instance. The backend exits if it cannot connect.

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