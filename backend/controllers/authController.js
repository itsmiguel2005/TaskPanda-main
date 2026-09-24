const bcrypt = require("bcryptjs");
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const { hasValidSmtpCredentials, sendPasswordResetEmail } = require("../services/mailer");
const {
  getLoginLock,
  recordFailedLogin,
  clearLoginAttempts,
  loginLockResponse,
} = require("../middleware/authAttempts");

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
    if (password.length < 8) passwordRequirements.push("at least 8 characters");
    if (password.length > 15) passwordRequirements.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) passwordRequirements.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) passwordRequirements.push("one special character");
    if (passwordRequirements.length) {
      return res.status(400).json({ message: `Password needs ${passwordRequirements.join(", ")}.` });
    }

    if (role === "client" && (!username || !fullName)) {
      return res.status(400).json({ message: "Username and full name are required for clients." });
    }
    if (role === "provider" && !username) {
      return res.status(400).json({ message: "Username is required for providers." });
    }
    if (/\s/.test(username)) {
      return res.status(400).json({ message: "Username cannot contain spaces." });
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
      return res.status(409).json({
        message: existingUser.email === email
          ? "An account with this email already exists."
          : "This username is already taken.",
      });
    }

    const user = await User.create({
      role,
      fullName: role === "client" ? fullName : undefined,
      username,
      firstName: role === "client" ? firstName : undefined,
      middleName: role === "client" ? middleName : undefined,
      lastName: role === "client" ? lastName : undefined,
      mobileNumber,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      professions: role === "provider" ? professions : [],
      province,
      city,
      barangay,
      address,
      dateOfBirth: role === "provider" ? new Date(`${dateOfBirth}T00:00:00.000Z`) : undefined,
    });

    return res.status(201).json({
      message: "Registration successful.",
      user: { id: user._id, role: user.role, email: user.email },
    });
  } catch (error) {
    console.error("Registration error:", error);
    if (error?.code === 11000 && (error?.keyPattern?.email || error?.keyPattern?.username)) {
      return res.status(409).json({
        message: error.keyPattern.username ? "This username is already taken." : "An account with this email already exists.",
      });
    }
    return res.status(500).json({ message: error.message || "Registration failed." });
  }
}

async function handleRegistrationAvailability(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const username = String(req.body.username || "").trim();
  const filters = [];

  if (/\s/.test(username)) {
    return res.status(400).json({ field: "username", message: "Username cannot contain spaces." });
  }
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
    if (currentAttempt?.lockedUntil === Infinity || currentAttempt?.lockedUntil > Date.now()) {
      return loginLockResponse(res, currentAttempt);
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || "");
    if (adminEmail && adminPassword && identifier.toLowerCase() === adminEmail && password === adminPassword) {
      clearLoginAttempts(normalizedIdentifier);
      return res.json({ message: "Login successful.", token: null, role: "admin", user: { email: adminEmail, role: "admin" } });
    }

    const user = await User.findOne({ $or: [{ email: normalizedIdentifier }, { username: identifier }] });
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

    clearLoginAttempts(normalizedIdentifier);
    return res.json({
      message: "Login successful.", token: null, role: user.role,
      user: { id: user._id, email: user.email, username: user.username, fullName: user.fullName, role: user.role },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
}

async function handleForgotPassword(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  try {
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "This email is not registered in the system." });

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codeHash = await bcrypt.hash(code, 10);
    const allowLocalDebugCode = !process.env.VERCEL && process.env.NODE_ENV !== "production";
    let sentMail = false;
    if (hasValidSmtpCredentials) {
      try {
        await sendPasswordResetEmail(email, code);
        sentMail = true;
      } catch (mailError) {
        console.warn("SMTP send failed. The request will now fail clearly instead of returning a hidden debug code.", mailError.message);
      }
    } else {
      console.warn("SMTP credentials are not configured for this environment.");
    }

    await PasswordReset.findOneAndUpdate(
      { email }, { email, codeHash, expiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    if (!sentMail && !allowLocalDebugCode) {
      return res.status(500).json({ message: "Password reset email delivery is not configured for this deployment. Set SMTP_USER and SMTP_PASSWORD in Vercel, then redeploy." });
    }
    return res.json({
      message: "If an account exists for that email, a reset code has been sent.",
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
    if (!reset || reset.expiresAt <= new Date()) return res.status(400).json({ message: "The reset code is missing or expired." });
    if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, reset.codeHash))) return res.status(400).json({ message: "The reset code is incorrect." });

    const user = await User.findOne({ email });
    if (!user || (await bcrypt.compare(password, user.passwordHash))) return res.status(400).json({ message: "Your new password must be different from your previous password." });
    const passwordRequirements = [];
    if (password.length < 8) passwordRequirements.push("at least 8 characters");
    if (password.length > 15) passwordRequirements.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) passwordRequirements.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) passwordRequirements.push("one special character");
    if (passwordRequirements.length) return res.status(400).json({ message: `Password needs ${passwordRequirements.join(", ")}.` });

    await User.updateOne({ email }, { $set: { passwordHash: await bcrypt.hash(password, 10) } });
    await PasswordReset.deleteOne({ _id: reset._id });
    clearLoginAttempts(email);
    return res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Password reset failed. Please try again." });
  }
}

module.exports = { handleRegister, handleRegistrationAvailability, handleLogin, handleForgotPassword, handleResetPassword };