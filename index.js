require("dotenv").config();

const path = require("path");
const express = require("express");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const nodemailer = require("nodemailer");
const connectDB = require("./db");
const User = require("./models/User");
const PasswordReset = require("./models/PasswordReset");

const app = express();
const PORT = process.env.PORT || 3000;
const authAttempts = new Map();
const loginAttempts = new Map();
const parseBoolean = (value) =>
  ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
const smtpUser = String(process.env.SMTP_USER || "").replace(/\s+/g, "").trim();
const smtpPassword = String(process.env.SMTP_PASSWORD || "").replace(/\s+/g, "").trim();
const smtpHost = String(process.env.SMTP_HOST || "smtp.gmail.com").trim();
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = parseBoolean(process.env.SMTP_SECURE);
const mailFrom = String(process.env.MAIL_FROM || smtpUser || "").replace(/\s+/g, "").trim();
const hasValidSmtpCredentials =
  smtpUser.length > 0 &&
  smtpPassword.length > 0 &&
  !/(yourgmail|example|app_password|replace)/i.test(smtpUser) &&
  !/(yourgmail|example|app_password|replace)/i.test(smtpPassword);

const mailTransport = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpSecure,
  requireTLS: true,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
  auth: hasValidSmtpCredentials
    ? {
        user: smtpUser,
        pass: smtpPassword,
      }
    : undefined,
});

if (process.env.VERCEL) {
  console.log("SMTP status:", {
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    configured: hasValidSmtpCredentials,
    from: mailFrom || "missing",
  });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + "-" + path.basename(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(file.mimetype);
    cb(ok ? null : new Error("Only image files are allowed"), ok);
  },
});

app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));

app.use("/api", async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    res.status(503).json({ message: "Database is unavailable.", error: error.message });
  }
});

function limitAuthAttempts(req, res, next) {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = (authAttempts.get(key) || []).filter((time) => now - time < windowMs);

  if (attempts.length >= 10) {
    return res.status(429).json({ message: "Too many attempts. Please try again later." });
  }

  attempts.push(now);
  authAttempts.set(key, attempts);
  return next();
}

function getLoginLock(identifier) {
  const attempt = loginAttempts.get(identifier);
  if (!attempt || !attempt.lockedUntil || attempt.lockedUntil === Infinity) return attempt;

  if (Date.now() >= attempt.lockedUntil) {
    attempt.lockedUntil = 0;
  }

  return attempt;
}

function recordFailedLogin(identifier) {
  const attempt = loginAttempts.get(identifier) || { failures: 0, lockedUntil: 0 };
  attempt.failures += 1;

  if (attempt.failures === 3) {
    attempt.lockedUntil = Date.now() + 60 * 1000;
  } else if (attempt.failures === 4) {
    attempt.lockedUntil = Date.now() + 3 * 60 * 1000;
  } else if (attempt.failures >= 5) {
    attempt.lockedUntil = Infinity;
  }

  loginAttempts.set(identifier, attempt);
  return attempt;
}

function loginLockResponse(res, attempt) {
  if (attempt.failures >= 5) {
    return res.status(423).json({
      message: "This account has reached the maximum login attempts. Please use Forgot password to regain access.",
      requiresPasswordReset: true,
    });
  }

  const waitMinutes = attempt.failures >= 4 ? 3 : 1;
  return res.status(429).json({
    message: `Too many failed login attempts. Please wait ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"} before trying again.`,
    retryAfterSeconds: waitMinutes * 60,
  });
}

app.use(express.static(path.join(__dirname, "dist")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

async function handleRegister(req, res) {
  try {
    const role = String(req.body.role || "").toLowerCase();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const fullName = String(req.body.fullName || "").trim();
    const username = String(req.body.username || "").trim();
    const firstName = String(req.body.firstName || "").trim();
    const middleName = String(req.body.middleName || "").trim();
    const lastName = String(req.body.lastName || "").trim();
    const mobileNumber = String(req.body.mobileNumber || "").trim();
    const professions = Array.isArray(req.body.professions) ? req.body.professions : [];
    const province = String(req.body.province || "").trim();
    const city = String(req.body.city || "").trim();
    const barangay = String(req.body.barangay || "").trim();
    const address = String(req.body.address || "").trim();
    const dateOfBirth = String(req.body.dateOfBirth || "").trim();

    if (!role || !["client", "provider"].includes(role)) {
      return res.status(400).json({ message: "Role is required and must be client or provider." });
    }

    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "A valid email is required." });
    }

    const passwordRequirements = [];
    if (!password) passwordRequirements.push("a password");
    if (/\s/.test(password)) passwordRequirements.push("no spaces");
    if (password.length < 6) passwordRequirements.push("at least 6 characters");
    if (password.length > 15) passwordRequirements.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) passwordRequirements.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) passwordRequirements.push("one special character");
    if (passwordRequirements.length) {
      return res.status(400).json({
        message: `Password needs ${passwordRequirements.join(", ")}.`,
      });
    }

    if (role === "client" && (!username || !fullName)) {
      return res.status(400).json({ message: "Username and full name are required for clients." });
    }

    if (role === "provider" && !username) {
      return res.status(400).json({ message: "Username is required for providers." });
    }

    if (/^\S+@\S+\.\S+$/.test(username)) {
      return res.status(400).json({ message: "Username cannot be an email address." });
    }

    if (role === "provider") {
      const birthDate = new Date(`${dateOfBirth}T00:00:00.000Z`);
      const today = new Date();
      const age = today.getUTCFullYear() - birthDate.getUTCFullYear() - (
        today.getUTCMonth() < birthDate.getUTCMonth() ||
        (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate())
          ? 1
          : 0
      );
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(birthDate.getTime()) || age < 18) {
        return res.status(400).json({ message: "Providers must be at least 18 years old." });
      }
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      const message = existingUser.email === email
        ? "An account with this email already exists."
        : "This username is already taken.";
      return res.status(409).json({ message });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      role,
      fullName: role === "client" ? fullName : undefined,
      username,
      firstName: role === "client" ? firstName : undefined,
      middleName: role === "client" ? middleName : undefined,
      lastName: role === "client" ? lastName : undefined,
      mobileNumber,
      email,
      passwordHash,
      professions: role === "provider" ? professions : [],
      province,
      city,
      barangay,
      address,
      dateOfBirth: role === "provider" ? new Date(`${dateOfBirth}T00:00:00.000Z`) : undefined,
    });

    return res.status(201).json({
      message: "Registration successful.",
      user: {
        id: user._id,
        role: user.role,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Registration error:", err);
    if (err?.code === 11000 && (err?.keyPattern?.email || err?.keyPattern?.username)) {
      return res.status(409).json({
        message: err.keyPattern.username ? "This username is already taken." : "An account with this email already exists.",
      });
    }
    return res.status(500).json({ message: err.message || "Registration failed." });
  }
}

async function handleRegistrationAvailability(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const username = String(req.body.username || "").trim();
  const filters = [];

  if (/^\S+@\S+\.\S+$/.test(username)) {
    return res.status(400).json({ field: "username", message: "Username cannot be an email address." });
  }
  if (email && /^\S+@\S+\.\S+$/.test(email)) filters.push({ email });
  if (username.length >= 3) filters.push({ username });
  if (!filters.length) return res.status(400).json({ message: "Enter a valid email or username." });

  const existingUser = await User.findOne({ $or: filters }).select("email username");
  if (existingUser) {
    const emailUsed = Boolean(email && existingUser.email === email);
    return res.status(409).json({
      field: emailUsed ? "email" : "username",
      message: emailUsed ? "An account with this email already exists." : "This username is already taken.",
    });
  }

  return res.json({ available: true });
}

async function handleLogin(req, res) {
  try {
    const identifier = String(req.body.email || req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!identifier || !password) {
      return res.status(400).json({ message: "Email or username and password are required." });
    }

    const normalizedIdentifier = identifier.toLowerCase();
    const currentAttempt = getLoginLock(normalizedIdentifier);
    if (currentAttempt?.lockedUntil === Infinity) {
      return loginLockResponse(res, currentAttempt);
    }
    if (currentAttempt?.lockedUntil > Date.now()) {
      return loginLockResponse(res, currentAttempt);
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || "");
    if (
      adminEmail &&
      adminPassword &&
      identifier.toLowerCase() === adminEmail &&
      password === adminPassword
    ) {
      loginAttempts.delete(normalizedIdentifier);
      return res.json({
        message: "Login successful.",
        token: null,
        role: "admin",
        user: { email: adminEmail, role: "admin" },
      });
    }

    const user = await User.findOne({
      $or: [{ email: normalizedIdentifier }, { username: identifier }],
    });

    if (!user) {
      const attempt = recordFailedLogin(normalizedIdentifier);
      if (attempt.lockedUntil) return loginLockResponse(res, attempt);
      return res.status(404).json({ message: "No account found with that email or username." });
    }

    if (!(await bcrypt.compare(password, user.passwordHash))) {
      const attempt = recordFailedLogin(normalizedIdentifier);
      if (attempt.lockedUntil) return loginLockResponse(res, attempt);
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }

    loginAttempts.delete(normalizedIdentifier);
    return res.json({
      message: "Login successful.",
      token: null,
      role: user.role,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
}

async function handleForgotPassword(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const genericResponse = {
    message: "If an account exists for that email, a reset code has been sent.",
  };

  try {
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "This email is not registered in the system." });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const smtpConfigured = hasValidSmtpCredentials;
    const allowLocalDebugCode = !process.env.VERCEL && process.env.NODE_ENV !== "production";

    let sentMail = false;
    if (smtpConfigured) {
      try {
        const mailPromise = mailTransport.sendMail({
          from: mailFrom || smtpUser,
          to: email,
          subject: "Reset your TaskPanda password",
          text: `Your TaskPanda password reset code is ${code}. It expires in 10 minutes.`,
          html: `<p>Your TaskPanda password reset code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${code}</p><p>This code expires in 10 minutes.</p>`,
        });
        const mailTimeout = new Promise((_, reject) => {
          setTimeout(() => reject(new Error("SMTP request timed out")), 10000);
        });
        const mailResult = await Promise.race([mailPromise, mailTimeout]);
        console.log("Password reset email accepted by SMTP:", {
          messageId: mailResult.messageId,
          accepted: mailResult.accepted,
          rejected: mailResult.rejected,
          response: mailResult.response,
        });
        sentMail = true;
      } catch (mailError) {
        console.warn("SMTP send failed. The request will now fail clearly instead of returning a hidden debug code.", mailError.message);
      }
    } else {
      console.warn("SMTP credentials are not configured for this environment.");
    }

    await PasswordReset.findOneAndUpdate(
      { email },
      { email, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (!sentMail && !allowLocalDebugCode) {
      return res.status(500).json({
        message: "Password reset email delivery is not configured for this deployment. Set SMTP_USER and SMTP_PASSWORD in Vercel, then redeploy.",
      });
    }

    return res.json({
      ...genericResponse,
      ...(sentMail || !allowLocalDebugCode ? {} : { debugCode: code }),
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(502).json({ message: "We could not send the reset email. Please try again." });
  }
}

async function handleResetPassword(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "");
    const reset = await PasswordReset.findOne({ email });

    if (!reset || reset.expiresAt <= new Date()) {
      return res.status(400).json({ message: "The reset code is missing or expired." });
    }
    if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, reset.codeHash))) {
      return res.status(400).json({ message: "The reset code is incorrect." });
    }

    const user = await User.findOne({ email });
    if (!user || (await bcrypt.compare(password, user.passwordHash))) {
      return res.status(400).json({ message: "Your new password must be different from your previous password." });
    }
    const passwordRequirements = [];
    if (password.length < 6) passwordRequirements.push("at least 6 characters");
    if (password.length > 15) passwordRequirements.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) passwordRequirements.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) passwordRequirements.push("one special character");
    if (passwordRequirements.length) {
      return res.status(400).json({ message: `Password needs ${passwordRequirements.join(", ")}.` });
    }

    await User.updateOne({ email }, { $set: { passwordHash: await bcrypt.hash(password, 10) } });
    await PasswordReset.deleteOne({ _id: reset._id });
    loginAttempts.delete(email);
    return res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Password reset failed. Please try again." });
  }
}

app.get("/api/health", async (req, res) => {
  try {
    const dbState = require("mongoose").connection.readyState;
    res.json({
      ok: true,
      mongo: dbState === 1 ? "connected" : "not_connected",
      port: PORT,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/api/auth/register", limitAuthAttempts, handleRegister);
app.post("/api/auth/check-registration", handleRegistrationAvailability);
app.post("/register", limitAuthAttempts, handleRegister);
app.post("/api/auth/login", handleLogin);
app.post("/login", handleLogin);
app.post("/api/auth/forgot-password", limitAuthAttempts, handleForgotPassword);
app.post("/api/auth/reset-password", limitAuthAttempts, handleResetPassword);

app.post("/api/verify", upload.fields([
  { name: "idFront", maxCount: 1 },
  { name: "idBack", maxCount: 1 },
]), (req, res) => {
  try {
    if (!req.files || !req.files.idFront || !req.files.idBack) {
      return res.status(400).json({ error: "Both ID front and ID back images are required" });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.get("/worker-register", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

if (require.main === module) {
  connectDB()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`TaskPanda server running at http://localhost:${PORT}`);
      });
    })
    .catch(() => {
      process.exitCode = 1;
    });
}

module.exports = app;
