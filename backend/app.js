const path = require("path");
const express = require("express");
const cors = require("cors");
const connectDB = require("./db");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const profileRoutes = require("./routes/profileRoutes");
const providerRoutes = require("./routes/providerRoutes");
const adminRoutes = require("./routes/adminRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const messageRoutes = require("./routes/messageRoutes");
const clientRoutes = require("./routes/clientRoutes");
const rewardsRoutes = require("./routes/rewardsRoutes");
const broadcastRoutes = require("./routes/broadcastRoutes");
const { corsOrigins } = require("./config/env");
const { trackAuthenticatedRequest } = require("./middleware/requireAuth");

const app = express();

app.use(cors({
  origin(origin, callback) {
    callback(null, Boolean(origin && corsOrigins.includes(origin)));
  },
  allowedHeaders: ["Authorization", "Content-Type"],
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
}));
app.use((req, res, next) => {
  const origin = req.get("origin");
  const isApiRequest = req.path === "/api" || req.path.startsWith("/api/");
  if (isApiRequest && req.method === "OPTIONS" && origin && !corsOrigins.includes(origin)) {
    return res.status(403).json({ message: "This origin is not allowed." });
  }
  return next();
});

app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    return res.status(503).json({ message: "Database is unavailable.", error: error.message });
  }
});
app.use("/api", trackAuthenticatedRequest);

app.use(express.static(path.join(__dirname, "../dist")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/rewards", rewardsRoutes);
app.use("/api/broadcasts", broadcastRoutes);
app.use("/api", messageRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api", healthRoutes);
app.use("/api", verificationRoutes);
app.use("/api/v1/users", verificationRoutes);

app.use("/api", (_req, res) => res.status(404).json({ message: "API endpoint not found." }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/worker-register", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.use((req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));

module.exports = app;