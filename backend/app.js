const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const connectDB = require("./db");
const config = require("./config/env");
const { sanitizeMongoInput } = require("./middleware/sanitizeMongoInput");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const profileRoutes = require("./routes/profileRoutes");
const providerRoutes = require("./routes/providerRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const messageRoutes = require("./routes/messageRoutes");
const clientRoutes = require("./routes/clientRoutes");
const adminRoutes = require("./routes/adminRoutes");

const app = express();

app.disable("x-powered-by");
app.set("trust proxy", config.trustProxy);

const allowedOrigins = new Set(config.corsOrigins);
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  maxAge: 600,
}));

app.use(helmet({
  strictTransportSecurity: process.env.NODE_ENV === "production" ? undefined : false,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      connectSrc: ["'self'"],
      ...(process.env.NODE_ENV === "production" ? { upgradeInsecureRequests: [] } : {}),
    },
  },
}));

app.use(express.urlencoded({ extended: true, limit: "10kb", parameterLimit: 100 }));
app.use(express.json({ limit: "10kb" }));
app.use(sanitizeMongoInput);

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    return next();
  } catch (error) {
    console.error("API database connection failed:", error.message);
    return res.status(503).json({ message: "Database is unavailable." });
  }
});

app.use(express.static(path.join(__dirname, "../dist")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/client", clientRoutes);
app.use("/api/providers", providerRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api", messageRoutes);
app.use("/api", healthRoutes);
app.use("/api", verificationRoutes);
app.use("/api", (_req, res) => res.status(404).json({ message: "API route not found." }));

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/worker-register", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.use((req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number(error.statusCode || error.status) || 500;
  if (status >= 500) console.error("Unhandled request error:", error);
  return res.status(status).json({
    message: status >= 500 ? "An unexpected server error occurred." : error.message || "Invalid request.",
  });
});

module.exports = app;