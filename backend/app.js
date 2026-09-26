const path = require("path");
const express = require("express");
const connectDB = require("./db");
const authRoutes = require("./routes/authRoutes");
const healthRoutes = require("./routes/healthRoutes");
const verificationRoutes = require("./routes/verificationRoutes");
const profileRoutes = require("./routes/profileRoutes");

const app = express();

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

app.use(express.static(path.join(__dirname, "../dist")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api", healthRoutes);
app.use("/api", verificationRoutes);

app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/login", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/register", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.get("/worker-register", (req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));
app.use((req, res) => res.sendFile(path.join(__dirname, "../dist/index.html")));

module.exports = app;