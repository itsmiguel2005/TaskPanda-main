const bcrypt = require("bcryptjs");
const { createHash, randomBytes, randomInt, randomUUID } = require("crypto");
const mongoose = require("mongoose");
const { waitUntil } = require("@vercel/functions");
const User = require("../models/User");
const { normalizePhilippinePhone, sendSms } = require("../utils/sendSms");
const AdminSession = require("../models/AdminSession");
const AdminLoginChallenge = require("../models/AdminLoginChallenge");
const { logAuditAction } = require("../utils/logAuditAction");
const config = require("../config/env");
const { geocodeAddress } = require("../services/geocoder");
const { getAgeFromDateOfBirth } = require("../utils/providerAge");
const {
  awardPendingReferralRewards,
  createReferralCode,
  recordReferralSignal,
  retryPendingReferralRewardsForReferrer,
} = require("../services/rewards");
const mailer = require("../services/mailer");
const {
  sendPushNotification,
} = require("../services/oneSignal");
const adminLoginSecurity = require("../services/adminLoginSecurity");
const {
  generateAdminLoginCode,
  hashAdminLoginCode,
  hashAdminChallengeToken,
  timingSafeHexEqual,
} = adminLoginSecurity;
const {
  generateLoginOtpCode,
  hashLoginOtpCode,
  signPreAuthToken,
  verifyPreAuthToken,
  timingSafeHexEqual: timingSafeOtpHexEqual,
} = require("../services/loginOtpSecurity");
const {
  getLoginLock,
  recordFailedLogin,
  clearLoginAttempts,
  loginLockResponse,
} = require("../middleware/authAttempts");

function sendPasswordChangedNotification(email) {
  if (!mailer.hasValidSmtpCredentials) {
    console.warn("Password changed email was not sent because SMTP credentials are not configured.");
    return;
  }
  void Promise.resolve()
    .then(() => mailer.sendPasswordChangedEmail(email))
    .catch((error) => {
      console.error("Password changed email delivery failed:", error);
    });
}

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const PASSWORD_RESET_MAX_ATTEMPTS = 5;
const registrationSessionCookie = "taskpanda_registration";
const ADMIN_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const LOGIN_OTP_TTL_MS = 5 * 60 * 1000;
const TRUSTED_DEVICE_TTL_SECONDS = 30 * 24 * 60 * 60;
const TRUSTED_DEVICE_COOKIE = "taskpanda_device_trust";
const personNamePattern = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;

function passwordResetAttemptQuery(user) {
  return {
    _id: user._id,
    passwordResetTokenHash: user.passwordResetTokenHash,
    passwordResetExpiresAt: mongoose.trusted({ $gt: new Date() }),
    $or: [
      { passwordResetAttempts: mongoose.trusted({ $lt: PASSWORD_RESET_MAX_ATTEMPTS }) },
      { passwordResetAttempts: mongoose.trusted({ $exists: false }) },
    ],
  };
}

async function recordFailedPasswordResetAttempt(user) {
  const result = await User.updateOne(passwordResetAttemptQuery(user), {
    $inc: { passwordResetAttempts: 1 },
  });
  return Boolean(result.matchedCount);
}

function getRequestCookie(req, name) {
  const parsedCookie = req.cookies?.[name];
  if (typeof parsedCookie === "string" && parsedCookie) return parsedCookie;
  const cookieHeader = String(req.get("cookie") || "");
  const encodedName = `${name}=`;
  const match = cookieHeader.split(";").map((part) => part.trim()).find((part) => part.startsWith(encodedName));
  return match ? match.slice(encodedName.length) : "";
}

function getDeviceName(req) {
  const userAgent = String(req.get("user-agent") || "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return userAgent.slice(0, 120) || "Unknown device";
}

async function recordReferralSignalSafely(user, req) {
  try {
    await recordReferralSignal(user._id, req, user.referredBy);
    if (user.role === "client") {
      await awardPendingReferralRewards(user._id);
      await retryPendingReferralRewardsForReferrer(user._id);
    }
  } catch (error) {
    console.error("Referral signal logging error:", error);
  }
}

function getPreAuthToken(req) {
  const authorization = String(req.get("authorization") || "");
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : "";
}

function getLoginUserPayload(user) {
  return {
    id: user._id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    firstName: user.firstName,
    middleName: user.middleName,
    lastName: user.lastName,
    mobileNumber: user.mobileNumber,
    phoneVerified: user.phoneVerified === true,
    province: user.province,
    city: user.city,
    barangay: user.barangay,
    address: user.address,
    geoLocation: user.geoLocation,
    professions: user.professions,
    bio: user.bio,
    profileImage: user.profileImage || "",
    createdAt: user.createdAt,
    role: user.role,
    isVerified: user.isVerified === true,
    verificationStatus: user.verificationStatus || "unverified",
    emailVerified: user.emailVerified !== false,
    registrationComplete: user.registrationComplete !== false,
  };
}

function sendTrustedDeviceCookie(res, token) {
  res.append(
    "Set-Cookie",
    `${TRUSTED_DEVICE_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${TRUSTED_DEVICE_TTL_SECONDS}`
  );
}

async function findPreAuthUser(req) {
  const tokenPayload = verifyPreAuthToken(getPreAuthToken(req), config.authOtpSecret);
  if (!tokenPayload || !mongoose.isValidObjectId(tokenPayload.sub)) return null;
  return User.findOne({
    _id: tokenPayload.sub,
    role: mongoose.trusted({ $in: ["client", "provider"] }),
    registrationComplete: true,
    isSuspended: mongoose.trusted({ $ne: true }),
    archivedAt: mongoose.trusted({ $exists: false }),
    otpExpiresAt: mongoose.trusted({ $gt: new Date() }),
    otpAttempts: mongoose.trusted({ $lt: 5 }),
  }).select("+otpHash +otpExpiresAt +otpAttempts");
}

function normalizePhilippineMobile(value) {
  if (/^09\d{9}$/.test(value)) return value;
  if (/^\+639\d{9}$/.test(value)) return `0${value.slice(3)}`;
  return "";
}

function getPhoneLookupValues(phone) {
  const internationalPhone = normalizePhilippinePhone(phone);
  return [internationalPhone, `0${internationalPhone.slice(3)}`, internationalPhone.slice(1)];
}

async function findRegistrationPhoneOtpUser(token, phoneValues, includeOtpFields = false) {
  if (!/^[a-f\d]{64}$/i.test(token)) return null;
  const query = User.findOne(mongoose.trusted({
    ...onboardingTokenFilter(hashToken(token)),
    ...(phoneValues ? { mobileNumber: mongoose.trusted({ $in: phoneValues }) } : {}),
    emailVerified: true,
    registrationComplete: false,
    isSuspended: mongoose.trusted({ $ne: true }),
    archivedAt: mongoose.trusted({ $exists: false }),
  }));
  if (includeOtpFields) query.select("+phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts");
  return query;
}

function hasGoodRegistrationPassword(password) {
  const complexityRequirements = [
    /[A-Z]/.test(password) && /[a-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9\s]/.test(password),
  ];
  return password.length >= 8
    && password.length <= 72
    && !/\s/.test(password)
    && complexityRequirements.filter(Boolean).length >= 2;
}

function rejectAdminRateLimit(res, retryAfterSeconds) {
  res.setHeader("Retry-After", String(retryAfterSeconds));
  return res.status(429).json({ message: "Too many admin sign-in attempts. Please try again later." });
}

function sendAdminPushAlertInBackground(options, warningMessage) {
  const sendAlert = () => sendPushNotification(options).catch((error) => {
    console.warn(warningMessage, error.message);
  });

  if (process.env.VERCEL) {
    waitUntil(Promise.resolve().then(sendAlert));
  } else {
    setImmediate(() => {
      void sendAlert();
    });
  }
}

function sendLoginOtpEmailInBackground(user, otpCode, context) {
  const deliverEmail = async () => {
    try {
      await mailer.sendOtpEmail(user.email, otpCode, user.fullName || user.firstName || user.username);
    } catch (error) {
      console.error(`${context} email could not be sent:`, error.message);
    }
  };

  if (process.env.VERCEL) {
    waitUntil(deliverEmail());
  } else {
    setImmediate(() => {
      void deliverEmail();
    });
  }
}

async function startAdminLogin(req, res, adminEmail, destinationEmail) {
  req.adminEmail = adminEmail;
  const ipAddress = req.ip || req.socket?.remoteAddress || "unknown";
  if (!destinationEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destinationEmail)) {
    return res.status(503).json({ message: "Admin email verification is not configured." });
  }
  if (config.adminOtpSecret.length < 32 || !mailer.hasValidSmtpCredentials) {
    return res.status(503).json({ message: "Admin email verification is not configured." });
  }

  const [sendIpLimit, sendEmailLimit] = await Promise.all([
    adminLoginSecurity.consumeAdminRateLimit("otp-send-ip", ipAddress, 3, 15 * 60 * 1000),
    adminLoginSecurity.consumeAdminRateLimit("otp-send-email", destinationEmail, 3, 15 * 60 * 1000),
  ]);
  if (!sendIpLimit.allowed) return rejectAdminRateLimit(res, sendIpLimit.retryAfterSeconds);
  if (!sendEmailLimit.allowed) return rejectAdminRateLimit(res, sendEmailLimit.retryAfterSeconds);

  const code = generateAdminLoginCode();
  const challengeToken = randomBytes(32).toString("hex");
  const challengeTokenHash = hashAdminChallengeToken(challengeToken);
  await AdminLoginChallenge.findOneAndUpdate(
    { adminEmail },
    {
      $set: {
        challengeTokenHash,
        codeHash: hashAdminLoginCode(code, config.adminOtpSecret),
        expiresAt: new Date(Date.now() + ADMIN_LOGIN_CHALLENGE_TTL_MS),
        attempts: 0,
        consumedAt: null,
      },
      $setOnInsert: { adminEmail },
    },
    { returnDocument: "after", upsert: true }
  );
  try {
    await mailer.sendAdminLoginOtpEmail(destinationEmail, code);
  } catch (error) {
    console.error("Admin sign-in email could not be sent:", error.message);
    try {
      await AdminLoginChallenge.deleteOne({ adminEmail, challengeTokenHash });
    } catch (cleanupError) {
      console.error("Failed to clean up admin sign-in challenge after email delivery failed:", cleanupError.message);
    }
    return res.status(502).json({ message: "We could not send the admin verification code. Please try again." });
  }
  sendAdminPushAlertInBackground({
    roles: ["admin"],
    title: "Admin sign-in requested",
    body: "A new administrator verification code was requested. The code is not included in this alert.",
    url: "/admin?section=dashboard",
    data: { event: "admin.otp_requested" },
  }, "OneSignal admin OTP alert failed:");
  clearLoginAttempts(adminEmail);
  return res.json({
    message: "A verification code is on its way to the admin email.",
    requiresAdminOtp: true,
    challengeToken,
    otpDestination: destinationEmail,
  });
}

function formatAddress(street, barangay, city, province) {
  return [street, barangay, city, province]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
}

function normalizeGeoLocation(value) {
  if (!value || value.type !== "Point" || !Array.isArray(value.coordinates) || value.coordinates.length !== 2) return null;
  const [longitude, latitude] = value.coordinates.map(Number);
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  return {
    type: "Point",
    coordinates: [Number(longitude.toFixed(6)), Number(latitude.toFixed(6))],
  };
}

function setRegistrationSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${registrationSessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secure}`
  );
}

function getRegistrationSessionFilter(req) {
  const cookie = String(req.get("cookie") || "");
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${registrationSessionCookie}=([a-f\\d]{64})(?:;|$)`, "i"));
  if (!match) return null;

  return {
    registrationSessionTokenHash: hashToken(match[1]),
    registrationSessionExpiresAt: mongoose.trusted({ $gt: new Date() }),
  };
}

async function createRegistrationSession(user, res) {
  const token = randomBytes(32).toString("hex");
  user.registrationSessionTokenHash = hashToken(token);
  user.registrationSessionExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  user.registrationVerificationClosedAt = undefined;
  await user.save();
  setRegistrationSessionCookie(res, token);
}

function getRegistrationAppUrl(req) {
  if (process.env.NODE_ENV !== "production") {
    try {
      const requestOrigin = req.get("origin") || req.get("referer") || "";
      const origin = new URL(String(requestOrigin));
      if (
        origin.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(origin.hostname)
      ) {
        return origin.origin;
      }
    } catch {
      // Fall back to the configured app URL when the request has no local origin.
    }
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return config.appUrl;
}

function onboardingTokenFilter(tokenHash, now = new Date()) {
  return mongoose.trusted({
    $or: [
      {
        onboardingTokenHash: tokenHash,
        onboardingTokenExpiresAt: mongoose.trusted({ $gt: now }),
      },
      {
        onboardingTokens: mongoose.trusted({
          $elemMatch: {
            tokenHash,
            expiresAt: mongoose.trusted({ $gt: now }),
          },
        }),
      },
    ],
  });
}

async function issueOnboardingToken(userId) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const result = await User.updateOne(
    mongoose.trusted({ _id: userId, emailVerified: true, registrationComplete: false }),
    {
      $set: { onboardingTokenHash: tokenHash, onboardingTokenExpiresAt: expiresAt },
      $push: { onboardingTokens: { $each: [{ tokenHash, expiresAt }], $slice: -5 } },
    }
  );
  if (!result.matchedCount) return null;
  return token;
}

async function issueAccountToken(userId) {
  const token = randomBytes(32).toString("hex");
  const lastActive = new Date();
  await User.updateOne(
    { _id: userId },
    {
      $set: { lastActive, lastOfflineAt: null, isOnline: true },
      $push: {
        accountTokens: {
          $each: [{
            tokenHash: hashToken(token),
            expiresAt: new Date(lastActive.getTime() + 30 * 24 * 60 * 60 * 1000),
          }],
          $slice: -5,
        },
      },
    }
  );
  return token;
}

async function handleLogout(req, res) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) {
    return res.status(401).json({ message: "Authentication is required." });
  }

  try {
    const loggedOutAt = new Date();
    const tokenHash = hashToken(token);
    const hasAnotherActiveSession = (req.user.accountTokens || []).some((session) =>
      session.tokenHash !== tokenHash && new Date(session.expiresAt).getTime() > loggedOutAt.getTime()
    );
    await User.updateOne(
      { _id: req.user._id },
      {
        $pull: { accountTokens: { tokenHash } },
        $set: {
          isOnline: hasAnotherActiveSession,
          lastOfflineAt: hasAnotherActiveSession ? null : loggedOutAt,
        },
      },
    );
    return res.json({ message: "Logged out successfully." });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ message: "Could not end this session cleanly." });
  }
}

async function handleAdminLogout(req, res) {
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  try {
    const result = await AdminSession.deleteOne({
      _id: req.adminSessionId,
      tokenHash: hashToken(token),
      adminEmail: req.adminEmail,
    });
    if (!result.deletedCount) return res.status(401).json({ message: "Your admin session has already ended." });
    void logAuditAction(req, {
      category: "SECURITY",
      action: "ADMIN_LOGOUT",
      targetResource: "AdminSession",
      targetId: req.adminSessionId,
      details: "Administrator signed out.",
    });
    return res.json({ message: "Admin session ended." });
  } catch (error) {
    console.error("Admin logout error:", error);
    return res.status(500).json({ message: "Could not end the admin session cleanly." });
  }
}

async function issueEmailVerification(user, { replaceExisting = false, appUrl = config.appUrl } = {}) {
  if (!mailer.hasValidSmtpCredentials || !appUrl) {
    throw new Error("Email verification delivery is not configured.");
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const previousTokens = replaceExisting ? [] : [...(user.emailVerificationTokens || [])];
  if (
    !replaceExisting &&
    user.emailVerificationTokenHash &&
    user.emailVerificationExpiresAt > new Date()
  ) {
    previousTokens.push({
      tokenHash: user.emailVerificationTokenHash,
      expiresAt: user.emailVerificationExpiresAt,
    });
  }
  previousTokens.push({ tokenHash, expiresAt });
  user.emailVerificationTokens = [...new Map(
    previousTokens
      .filter((entry) => entry.expiresAt > new Date())
      .map((entry) => [entry.tokenHash, entry])
  ).values()].slice(-5);
  user.emailVerificationTokenHash = tokenHash;
  user.emailVerificationExpiresAt = expiresAt;
  if (user.emailVerified === false && user.registrationComplete === false) {
    user.registrationExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
  await user.save();

  const verificationUrl = new URL("/verify-email", `${appUrl}/`);
  verificationUrl.searchParams.set("token", token);
  await mailer.sendEmailVerificationEmail(user.email, verificationUrl.toString());
}

async function handleRegister(req, res) {
  try {
    if (req.body.registrationPhase !== "start") {
      return res.status(400).json({ message: "Registration must start with email verification." });
    }

    const role = String(req.body.role || "").toLowerCase();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const fullName = String(req.body.fullName || "").trim();
    const username = String(req.body.username || "").trim();
    const referralCode = String(req.body.referralCode || "").trim().toUpperCase();
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

    if (!hasGoodRegistrationPassword(password)) {
      return res.status(400).json({ message: "Password must be at least 8 characters, contain no spaces, and meet at least two other strength requirements." });
    }

    if (!/^[A-Za-z0-9_.-]{4,15}$/.test(username)) {
      return res.status(400).json({ message: "Username must be 4-15 characters and use only letters, numbers, dots, underscores, or hyphens." });
    }
    if (referralCode && role !== "client") {
      return res.status(400).json({ message: "Referral codes are available for client registrations." });
    }
    let referralOwner = null;
    if (referralCode) {
      referralOwner = await User.findOne({
        referralCode,
        role: "client",
        registrationComplete: true,
      }).select("_id email");
      if (!referralOwner) {
        return res.status(400).json({ message: "That referral code is not valid. Check the code and try again." });
      }
      if (referralOwner.email === email) {
        return res.status(400).json({ message: "You cannot use your own referral code." });
      }
    }

    let existingEmailUser = await User.findOne({ email }).select(
      "+emailVerificationTokenHash +emailVerificationExpiresAt +emailVerificationTokens"
    );
    if (
      existingEmailUser?.emailVerified === false &&
      existingEmailUser?.registrationComplete === false &&
      existingEmailUser.registrationExpiresAt &&
      existingEmailUser.registrationExpiresAt <= new Date()
    ) {
      await User.deleteOne({ _id: existingEmailUser._id, emailVerified: false, registrationComplete: false });
      existingEmailUser = null;
    }
    if (existingEmailUser) {
      let canResumeRegistration = false;
      if (existingEmailUser.emailVerified === false && existingEmailUser.registrationComplete === false) {
        if (referralOwner) {
          if (
            existingEmailUser.referredBy &&
            String(existingEmailUser.referredBy) !== String(referralOwner._id)
          ) {
            return res.status(409).json({ message: "A different referral code is already attached to this registration." });
          }
          let referralChanged = false;
          if (!existingEmailUser.referredBy) {
            existingEmailUser.referredBy = referralOwner._id;
            referralChanged = true;
          }
          if (existingEmailUser.referralRewardStatus !== "REWARDED") {
            existingEmailUser.referralRewardStatus = "PENDING_FIRST_BOOKING";
            referralChanged = true;
          }
          if (referralChanged) await existingEmailUser.save();
        }
        try {
          await recordReferralSignal(
            existingEmailUser._id,
            req,
            existingEmailUser.referredBy || null
          );
        } catch (signalError) {
          console.error("Referral registration signal could not be saved:", signalError);
          return res.status(503).json({
            message: "Your registration is saved, but referral details could not be recorded. Please retry.",
          });
        }
        try {
          canResumeRegistration = await bcrypt.compare(password, existingEmailUser.passwordHash);
          if (canResumeRegistration) {
            await createRegistrationSession(existingEmailUser, res);
          }
          await issueEmailVerification(existingEmailUser, { appUrl: getRegistrationAppUrl(req) });
        } catch (mailError) {
          console.warn("Verification email could not be resent:", mailError.message);
          return res.status(502).json({ message: "We could not send the verification email. Please try again." });
        }
      }
      return res.status(202).json({
        message: "If this email can be registered, a verification link has been sent.",
        registrationSession: canResumeRegistration,
      });
    }

    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ message: "This username is already taken.", field: "username" });
    }

    const userId = new mongoose.Types.ObjectId();
    const user = await User.create({
      _id: userId,
      role,
      username,
      ...(role === "client" ? { referralCode: createReferralCode(userId) } : {}),
      ...(referralOwner
        ? {
            referredBy: referralOwner._id,
            referralRewardStatus: "PENDING_FIRST_BOOKING",
          }
        : {}),
      email,
      passwordHash: await bcrypt.hash(password, 10),
      professions: role === "provider" ? professions : [],
      emailVerified: false,
      registrationComplete: false,
      registrationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    try {
      await recordReferralSignal(user._id, req, user.referredBy || null);
    } catch (signalError) {
      console.error("Referral registration signal could not be saved:", signalError);
      return res.status(503).json({
        message: "Your registration is saved, but referral details could not be recorded. Please retry.",
      });
    }

    try {
      await createRegistrationSession(user, res);
      await issueEmailVerification(user, { appUrl: getRegistrationAppUrl(req) });
    } catch (mailError) {
      console.warn("Verification email could not be sent:", mailError.message);
      return res.status(502).json({ message: "Your registration is saved, but we could not send the verification email. Please retry." });
    }

    return res.status(201).json({
      message: "If this email can be registered, a verification link has been sent.",
      registrationSession: true,
    });
  } catch (error) {
    console.error("Registration error:", error);
    if (error?.code === 11000 && (error?.keyPattern?.email || error?.keyPattern?.username)) {
      return res.status(409).json({
        message: error.keyPattern.username ? "This username is already taken." : "An account with this email already exists.",
      });
    }
    return res.status(500).json({ message: "Registration failed. Please try again." });
  }
}

async function handleRegistrationAvailability(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const username = String(req.body.username || "").trim();
  const filters = [];

  if (username && !/^[A-Za-z0-9_.-]{4,15}$/.test(username)) {
    return res.status(400).json({ field: "username", message: "Username must be 4-15 characters and use only letters, numbers, dots, underscores, or hyphens." });
  }
  if (email && /^\S+@\S+\.\S+$/.test(email)) filters.push({ email });
  if (username.length >= 4) filters.push({ username });
  if (!filters.length) return res.status(400).json({ message: "Enter a valid email or username." });

  const existingUser = await User.findOne({ $or: filters }).select("email username emailVerified registrationComplete");
  if (existingUser && email && existingUser.email === email && existingUser.emailVerified === false && existingUser.registrationComplete === false) {
    return res.json({ available: true, pendingVerification: true });
  }
  if (existingUser) {
    const emailUsed = Boolean(email && existingUser.email === email);
    return res.status(409).json({
      field: emailUsed ? "email" : "username",
      message: emailUsed ? "An account with this email already exists." : "This username is already taken.",
    });
  }
  return res.json({ available: true });
}

async function handleVerifyEmail(req, res) {
  const token = String(req.body.token || "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) {
    return res.status(400).json({ message: "This verification link is invalid or expired." });
  }

  const tokenHash = hashToken(token);
  const activeToken = {
    $or: [
      {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: mongoose.trusted({ $gt: new Date() }),
      },
      {
        emailVerificationTokens: mongoose.trusted({
          $elemMatch: {
            tokenHash,
            expiresAt: mongoose.trusted({ $gt: new Date() }),
          },
        }),
      },
    ],
  };
  let user = await User.findOneAndUpdate(
    mongoose.trusted({ ...activeToken, emailVerified: false, registrationComplete: false }),
    {
      $set: { emailVerified: true },
      $unset: {
        registrationExpiresAt: 1,
      },
    },
    { new: true }
  );

  if (!user) {
    user = await User.findOne(mongoose.trusted({
      ...activeToken,
      emailVerified: true,
      registrationComplete: false,
    }));
  }
  if (!user) {
    return res.status(400).json({ message: "This verification link is invalid or expired. Request a new one to continue." });
  }

  const registrationResumeCode = randomBytes(6).toString("hex").toUpperCase();
  user.registrationResumeCodeHash = hashToken(registrationResumeCode);
  user.registrationResumeCodeExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await user.save();

  return res.json({
    message: "Email verified successfully. Return to the browser where you started registration to continue.",
    verified: true,
    registrationResumeCode,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role,
      professions: user.professions,
      emailVerified: true,
      registrationComplete: false,
    },
  });
}

async function handleRegistrationStatus(req, res) {
  try {
    const sessionFilter = getRegistrationSessionFilter(req);
    if (!sessionFilter) {
      return res.status(401).json({ message: "Registration session not found." });
    }

    const user = await User.findOne(mongoose.trusted({
      ...sessionFilter,
      registrationComplete: false,
    })).select("+registrationVerificationClosedAt");
    if (!user) {
      return res.status(401).json({ message: "Registration session expired." });
    }

    if (!user.emailVerified) {
      return res.json({
        verified: false,
        verificationTabClosed: Boolean(user.registrationVerificationClosedAt),
      });
    }

    const onboardingToken = randomBytes(32).toString("hex");
    const onboardingTokenHash = hashToken(onboardingToken);
    const onboardingExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const claimedUser = await User.findOneAndUpdate(
      mongoose.trusted({
        _id: user._id,
        ...sessionFilter,
        emailVerified: true,
        registrationComplete: false,
      }),
      {
        $set: {
          registrationResumeClaimedAt: new Date(),
          onboardingTokenHash,
          onboardingTokenExpiresAt: onboardingExpiresAt,
        },
        $push: {
          onboardingTokens: {
            $each: [{ tokenHash: onboardingTokenHash, expiresAt: onboardingExpiresAt }],
            $slice: -5,
          },
        },
        $unset: {
          registrationResumeCodeHash: 1,
          registrationResumeCodeExpiresAt: 1,
        },
      },
      { new: true }
    );
    if (!claimedUser) return res.json({ verified: true, alreadyResumed: true });

    return res.json({
      verified: true,
      onboardingToken,
      user: {
        id: claimedUser._id,
        email: claimedUser.email,
        username: claimedUser.username,
        role: claimedUser.role,
        professions: claimedUser.professions,
        emailVerified: true,
        registrationComplete: false,
      },
    });
  } catch (error) {
    console.error("Registration status error:", error);
    return res.status(500).json({ message: "Could not check registration status." });
  }
}

async function handleResumeRegistration(req, res) {
  const code = String(req.body.code || "").trim().toUpperCase();
  if (!/^[A-F0-9]{12}$/.test(code)) {
    return res.status(400).json({ message: "Enter the 12-character code shown on the verified device." });
  }

  try {
    const onboardingToken = randomBytes(32).toString("hex");
    const onboardingTokenHash = hashToken(onboardingToken);
    const onboardingExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const claimAvailable = mongoose.trusted({
      $or: [
        { registrationResumeClaimedAt: mongoose.trusted({ $exists: false }) },
        { registrationResumeClaimedAt: mongoose.trusted({ $lt: new Date(now.getTime() - 10 * 60 * 1000) }) },
      ],
    });
    const user = await User.findOneAndUpdate(
      mongoose.trusted({
        registrationResumeCodeHash: hashToken(code),
        registrationResumeCodeExpiresAt: mongoose.trusted({ $gt: now }),
        emailVerified: true,
        registrationComplete: false,
        ...claimAvailable,
      }),
      {
        $set: {
          registrationResumeClaimedAt: now,
          onboardingTokenHash,
          onboardingTokenExpiresAt: onboardingExpiresAt,
        },
        $push: {
          onboardingTokens: {
            $each: [{ tokenHash: onboardingTokenHash, expiresAt: onboardingExpiresAt }],
            $slice: -5,
          },
        },
        $unset: {
          registrationResumeCodeHash: 1,
          registrationResumeCodeExpiresAt: 1,
        },
      },
      { new: true }
    );
    if (!user) {
      return res.status(400).json({ message: "That code is invalid, expired, or already used. Verify your email again or sign in to continue." });
    }

    return res.json({
      onboardingToken,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        role: user.role,
        professions: user.professions,
        emailVerified: true,
        registrationComplete: false,
      },
    });
  } catch (error) {
    console.error("Registration resume code error:", error);
    return res.status(500).json({ message: "Could not resume registration with that code." });
  }
}

async function handleRegistrationTabClosed(req, res) {
  try {
    const sessionFilter = getRegistrationSessionFilter(req);
    if (!sessionFilter) {
      return res.status(401).json({ message: "Registration session not found." });
    }

    const user = await User.findOneAndUpdate(
      mongoose.trusted({
        ...sessionFilter,
        emailVerified: true,
        registrationComplete: false,
      }),
      { $set: { registrationVerificationClosedAt: new Date() } },
      { new: true }
    );
    if (!user) {
      return res.status(409).json({ message: "Verify the email before continuing registration." });
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Registration tab close error:", error);
    return res.status(500).json({ message: "Could not continue registration." });
  }
}

async function handleResendVerification(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return res.status(400).json({ message: "Enter a valid email address." });
  }

  const user = await User.findOne({ email, registrationComplete: false }).select(
    "+emailVerificationTokenHash +emailVerificationExpiresAt +emailVerificationTokens"
  );
  if (!user) {
    return res.json({ message: "If a pending registration exists for that email, a new link has been sent." });
  }

  try {
    await issueEmailVerification(user, {
      replaceExisting: true,
      appUrl: getRegistrationAppUrl(req),
    });
    return res.json({ message: "If a pending registration exists for that email, a new link has been sent." });
  } catch (error) {
    console.warn("Verification email could not be resent:", error.message);
    return res.status(502).json({ message: "We could not send the verification email. Please try again." });
  }
}

async function handleCompleteRegistration(req, res) {
  const authorization = String(req.get("authorization") || "");
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!/^[a-f\d]{64}$/i.test(token)) {
    return res.status(401).json({ message: "Your registration session expired. Sign in again to continue." });
  }

  const tokenHash = hashToken(token);
  const now = new Date();
  const user = await User.findOne(mongoose.trusted({
    ...onboardingTokenFilter(tokenHash, now),
    emailVerified: true,
    registrationComplete: false,
  }));
  if (!user) {
    return res.status(401).json({ message: "Your registration session expired. Sign in again to continue." });
  }

  const firstName = String(req.body.firstName || "").trim();
  const middleName = String(req.body.middleName || "").trim();
  const lastName = String(req.body.lastName || "").trim();
  const fullName = String(req.body.fullName || [firstName, middleName, lastName].filter(Boolean).join(" ")).trim();
  const mobileNumber = normalizePhilippineMobile(String(req.body.mobileNumber || "").trim());
  const province = String(req.body.province || "").trim();
  const city = String(req.body.city || "").trim();
  const barangay = String(req.body.barangay || "").trim();
  if (!fullName || fullName.length > 100 || !personNamePattern.test(fullName)) {
    return res.status(400).json({ message: "Enter a valid full name of 100 characters or fewer." });
  }
  if (!mobileNumber) {
    return res.status(400).json({ message: "Enter a valid Philippine mobile number, such as +63 9XX XXX XXXX." });
  }
  if (user.phoneVerified !== true || user.mobileNumber !== mobileNumber) {
    return res.status(400).json({ message: "Verify this mobile number by SMS before completing registration." });
  }
  const address = String(req.body.address || formatAddress("", barangay, city, province)).trim();
  let geoLocation = normalizeGeoLocation(req.body.geoLocation);
  if (req.body.geoLocation != null && !geoLocation) {
    return res.status(400).json({ message: "Choose a valid map location." });
  }
  geoLocation ||= address ? await geocodeAddress(address, { barangay, city, province }) : null;
  if (!geoLocation) {
    return res.status(400).json({ message: "Pin your exact location on the map before completing registration." });
  }
  const dateOfBirth = String(req.body.dateOfBirth || "").trim();

  let parsedDateOfBirth;
  let professions;
  if (user.role === "provider") {
    if (!geoLocation || !Array.isArray(geoLocation.coordinates) || geoLocation.coordinates.length !== 2) {
      return res.status(400).json({ message: "Use your current location so nearby clients can find your profile." });
    }
    const age = getAgeFromDateOfBirth(dateOfBirth, now);
    if (age === null || age < 18 || age > 120) {
      return res.status(400).json({ message: "Providers must be between 18 and 120 years old and enter a valid date of birth." });
    }
    parsedDateOfBirth = new Date(`${dateOfBirth}T00:00:00.000Z`);
    const submittedProfessions = req.body.professions ?? user.professions;
    if (!Array.isArray(submittedProfessions) || submittedProfessions.length === 0) {
      return res.status(400).json({ message: "Select at least one profession to continue." });
    }
    if (submittedProfessions.length > 3) {
      return res.status(400).json({ message: "Choose no more than 3 professions or trades." });
    }
    if (submittedProfessions.some((profession) => typeof profession !== "string" || !profession.trim())) {
      return res.status(400).json({ message: "Choose valid professions or trades to continue." });
    }
    professions = [...new Map(
      submittedProfessions.map((profession) => [profession.trim().toLowerCase(), profession.trim()])
    ).values()];
  }

  user.referralCode ||= user.role === "client" ? createReferralCode(user._id) : undefined;
  const referralRewardStatus = user.referredBy && user.referralRewardStatus !== "REWARDED"
    ? "PENDING_FIRST_BOOKING"
    : user.referralRewardStatus;
  const updatedUser = await User.findOneAndUpdate(
    mongoose.trusted({
      _id: user._id,
      ...onboardingTokenFilter(tokenHash),
      emailVerified: true,
      registrationComplete: false,
      mobileNumber,
      phoneVerified: true,
    }),
    {
      $set: {
        fullName,
        firstName,
        middleName,
        lastName,
        mobileNumber,
        province,
        city,
        barangay,
        address,
        ...(geoLocation ? { geoLocation } : {}),
        registrationComplete: true,
        ...(user.role === "client" ? { referralCode: user.referralCode } : {}),
        ...(referralRewardStatus ? { referralRewardStatus } : {}),
        ...(user.role === "provider" ? { dateOfBirth: parsedDateOfBirth, professions } : {}),
      },
      $unset: {
        phoneOtpHash: 1,
        phoneOtpExpiresAt: 1,
        phoneOtpAttempts: 1,
        onboardingTokenHash: 1,
        onboardingTokenExpiresAt: 1,
        onboardingTokens: 1,
        emailVerificationTokenHash: 1,
        emailVerificationExpiresAt: 1,
        emailVerificationTokens: 1,
        registrationSessionTokenHash: 1,
        registrationSessionExpiresAt: 1,
        registrationVerificationClosedAt: 1,
        registrationResumeClaimedAt: 1,
        registrationResumeCodeHash: 1,
        registrationResumeCodeExpiresAt: 1,
      },
    },
    { new: true, runValidators: true }
  );

  if (!updatedUser) {
    return res.status(401).json({ message: "Your registration session expired. Sign in again to continue." });
  }

  const accountToken = await issueAccountToken(updatedUser._id);

  res.setHeader(
    "Set-Cookie",
    `${registrationSessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`
  );

  return res.json({
    message: "Registration complete.",
    token: accountToken,
    user: {
      id: updatedUser._id,
      email: updatedUser.email,
      username: updatedUser.username,
      fullName: updatedUser.fullName,
      province: updatedUser.province,
      city: updatedUser.city,
      barangay: updatedUser.barangay,
      address: updatedUser.address,
      geoLocation: updatedUser.geoLocation,
      mobileNumber: updatedUser.mobileNumber,
      firstName: updatedUser.firstName,
      middleName: updatedUser.middleName,
      lastName: updatedUser.lastName,
      professions: updatedUser.professions,
      phoneVerified: updatedUser.phoneVerified === true,
      bio: updatedUser.bio,
      createdAt: updatedUser.createdAt,
      role: updatedUser.role,
      referralCode: updatedUser.referralCode,
      referralRewardStatus: updatedUser.referralRewardStatus || "",
      stampProgress: updatedUser.stampProgress,
      completedBookings: updatedUser.completedBookings,
      vouchers: updatedUser.vouchers.map((voucher) => ({
        id: String(voucher._id),
        kind: voucher.kind,
        title: voucher.title,
        origin: voucher.origin,
        amount: Number(voucher.amount || 0),
        status: voucher.status,
        awardedAt: voucher.awardedAt,
        expiresAt: voucher.expiresAt || null,
        redeemedAt: voucher.redeemedAt || null,
      })),
      emailVerified: true,
      registrationComplete: true,
    },
  });
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
    if (adminEmail && adminPassword && identifier.toLowerCase() === adminEmail) {
      req.adminEmail = adminEmail;
      const [credentialIpLimit, credentialAccountLimit] = await Promise.all([
        adminLoginSecurity.consumeAdminRateLimit("credential-ip", req.ip || req.socket?.remoteAddress || "unknown", 10, 15 * 60 * 1000),
        adminLoginSecurity.consumeAdminRateLimit("credential-account", adminEmail, 10, 15 * 60 * 1000),
      ]);
      if (!credentialIpLimit.allowed) return rejectAdminRateLimit(res, credentialIpLimit.retryAfterSeconds);
      if (!credentialAccountLimit.allowed) return rejectAdminRateLimit(res, credentialAccountLimit.retryAfterSeconds);

      if (password !== adminPassword) {
        void logAuditAction(req, {
          category: "SECURITY",
          action: "FAILED_LOGIN_ATTEMPT",
          targetResource: "AdminAccount",
          targetId: adminEmail,
          details: "Administrator password verification failed.",
        });
        const attempt = recordFailedLogin(normalizedIdentifier);
        if (attempt.lockedUntil) return loginLockResponse(res, attempt);
        return res.status(401).json({ message: "Invalid admin credentials. Please try again." });
      }
      return await startAdminLogin(req, res, adminEmail, config.adminOtpEmail);
    }

    const user = await User.findOne({ $or: [{ email: normalizedIdentifier }, { username: identifier }] })
      .select("+trustedDevices +adminContactEmail");
    if (!user) {
      const attempt = recordFailedLogin(normalizedIdentifier);
      if (attempt.lockedUntil) return loginLockResponse(res, attempt);
      return res.status(404).json({ message: "No account found with that email or username." });
    }
    if (user.role === "admin") {
      req.adminEmail = user.email;
      req.adminId = user._id;
      req.adminName = user.fullName || user.username || user.email;
    }
    if (!(await bcrypt.compare(password, user.passwordHash))) {
      if (user.role === "admin") {
        void logAuditAction(req, {
          category: "SECURITY",
          action: "FAILED_LOGIN_ATTEMPT",
          targetResource: "AdminAccount",
          targetId: user.email,
          details: "Administrator password verification failed.",
        });
      }
      const attempt = recordFailedLogin(normalizedIdentifier);
      if (attempt.lockedUntil) return loginLockResponse(res, attempt);
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }
    if (user.isSuspended || user.archivedAt) {
      return res.status(403).json({ message: "This account is unavailable. Contact TaskPanda support for assistance." });
    }
    if (user.role === "admin") {
      return await startAdminLogin(req, res, user.email, user.adminContactEmail || user.email);
    }

    if (user.emailVerified === false) {
      return res.status(403).json({
        message: "Verify your email before signing in.",
        requiresEmailVerification: true,
        email: user.email,
      });
    }

    if (user.registrationComplete === false) {
      const onboardingToken = randomBytes(32).toString("hex");
      const onboardingSession = await User.updateOne(
        { _id: user._id, emailVerified: true, registrationComplete: false },
        {
          $set: {
            onboardingTokenHash: hashToken(onboardingToken),
            onboardingTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }
      );
      if (!onboardingSession.matchedCount) {
        return res.status(409).json({ message: "Your registration changed. Sign in again to continue." });
      }
      clearLoginAttempts(normalizedIdentifier);
      return res.json({
        message: "Email verified. Continue your registration.",
        requiresRegistrationCompletion: true,
        onboardingToken,
        user: {
          id: user._id,
          email: user.email,
          username: user.username,
          role: user.role,
          professions: user.professions,
          emailVerified: true,
          registrationComplete: false,
        },
      });
    }

    if (!user.address) {
      const formattedAddress = formatAddress("", user.barangay, user.city, user.province);
      if (formattedAddress) {
        user.address = formattedAddress;
        await user.save();
      }
    }

    const presentedDeviceToken = getRequestCookie(req, TRUSTED_DEVICE_COOKIE);
    const presentedDeviceTokenHash = presentedDeviceToken ? hashToken(presentedDeviceToken) : "";
    const isTrustProtectedRole = ["client", "provider"].includes(user.role);
    let trustedDevice = isTrustProtectedRole && presentedDeviceTokenHash && (user.trustedDevices || []).find((device) =>
      timingSafeOtpHexEqual(device.deviceTokenHash, presentedDeviceTokenHash)
      && new Date(device.lastLoginAt).getTime() > Date.now() - TRUSTED_DEVICE_TTL_SECONDS * 1000
    );
    if (trustedDevice) {
      const now = new Date();
      const trustExpiresAfter = new Date(now.getTime() - TRUSTED_DEVICE_TTL_SECONDS * 1000);
      const updatedDevice = await User.updateOne(
        {
          _id: user._id,
          trustedDevices: mongoose.trusted({
            $elemMatch: {
              deviceTokenHash: presentedDeviceTokenHash,
              lastLoginAt: mongoose.trusted({ $gt: trustExpiresAfter }),
            },
          }),
        },
        { $set: { "trustedDevices.$.lastLoginAt": now } },
      );
      if (!updatedDevice.matchedCount) trustedDevice = null;
    }
    if (isTrustProtectedRole && !trustedDevice) {
      if (config.authOtpSecret.length < 32 || !mailer.hasValidSmtpCredentials) {
        return res.status(503).json({ message: "Email sign-in verification is not configured." });
      }

      const otpCode = generateLoginOtpCode();
      const otpHash = hashLoginOtpCode(otpCode, user._id, config.authOtpSecret);
      await User.updateOne(
        { _id: user._id },
        {
          $set: {
            otpHash,
            otpExpiresAt: new Date(Date.now() + LOGIN_OTP_TTL_MS),
            otpAttempts: 0,
          },
        },
      );
      sendLoginOtpEmailInBackground(user, otpCode, "Sign-in verification");

      clearLoginAttempts(normalizedIdentifier);
      return res.json({
        message: "Your verification code is on its way to your email.",
        requiresOtp: true,
        preAuthToken: signPreAuthToken(user._id, config.authOtpSecret),
        role: user.role,
      });
    }

    if (trustedDevice) sendTrustedDeviceCookie(res, presentedDeviceToken);
    clearLoginAttempts(normalizedIdentifier);
    await recordReferralSignalSafely(user, req);
    const accountToken = await issueAccountToken(user._id);
    return res.json({
      message: "Login successful.", token: accountToken, role: user.role,
      user: getLoginUserPayload(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
}

async function handleVerifyLoginOtp(req, res) {
  try {
    if (config.authOtpSecret.length < 32) {
      return res.status(503).json({ message: "Email sign-in verification is not configured." });
    }

    const otpCode = String(req.body.otpCode || "").trim();
    if (!/^\d{6}$/.test(otpCode)) {
      return res.status(400).json({ message: "Enter the 6-digit verification code." });
    }

    const user = await findPreAuthUser(req);
    if (!user?.otpHash) {
      return res.status(400).json({ message: "The verification code is invalid or expired. Sign in again to request a new one." });
    }
    const submittedOtpHash = hashLoginOtpCode(otpCode, user._id, config.authOtpSecret);
    if (!timingSafeOtpHexEqual(user.otpHash, submittedOtpHash)) {
      const attempt = await User.findOneAndUpdate(
        {
          _id: user._id,
          otpHash: user.otpHash,
          otpExpiresAt: mongoose.trusted({ $gt: new Date() }),
          otpAttempts: mongoose.trusted({ $lt: 5 }),
        },
        { $inc: { otpAttempts: 1 } },
        { returnDocument: "after" },
      ).select("+otpAttempts");
      if (!attempt || attempt.otpAttempts >= 5) {
        return res.status(429).json({ message: "Too many incorrect codes. Sign in again to request a new one." });
      }
      return res.status(400).json({ message: "The verification code is incorrect." });
    }

    const rememberDevice = req.body.rememberDevice === true;
    const deviceToken = rememberDevice ? randomUUID() : "";
    const now = new Date();
    const update = {
      $unset: { otpHash: 1, otpExpiresAt: 1, otpAttempts: 1 },
    };
    if (rememberDevice) {
      update.$push = {
        trustedDevices: {
          $each: [{
            deviceTokenHash: hashToken(deviceToken),
            deviceName: getDeviceName(req),
            lastLoginAt: now,
          }],
          $slice: -10,
        },
      };
    }
    const consumedOtp = await User.findOneAndUpdate(
      {
        _id: user._id,
        otpHash: submittedOtpHash,
        otpExpiresAt: mongoose.trusted({ $gt: now }),
        otpAttempts: mongoose.trusted({ $lt: 5 }),
        isSuspended: mongoose.trusted({ $ne: true }),
        archivedAt: mongoose.trusted({ $exists: false }),
      },
      update,
      { returnDocument: "after" },
    );
    if (!consumedOtp) {
      return res.status(400).json({ message: "The verification code is invalid or expired. Sign in again to request a new one." });
    }
    if (rememberDevice) sendTrustedDeviceCookie(res, deviceToken);

    await recordReferralSignalSafely(consumedOtp, req);
    const accountToken = await issueAccountToken(consumedOtp._id);
    return res.json({
      message: "Login successful.",
      token: accountToken,
      role: consumedOtp.role,
      user: getLoginUserPayload(consumedOtp),
    });
  } catch (error) {
    console.error("Sign-in code verification error:", error);
    return res.status(500).json({ message: "Could not verify the sign-in code. Please try again." });
  }
}

async function handleResendLoginOtp(req, res) {
  try {
    if (config.authOtpSecret.length < 32 || !mailer.hasValidSmtpCredentials) {
      return res.status(503).json({ message: "Email sign-in verification is not configured." });
    }

    const user = await findPreAuthUser(req);
    if (!user?.otpHash) {
      return res.status(400).json({ message: "This verification request has expired. Sign in again to request a new code." });
    }
    const otpCode = generateLoginOtpCode();
    const otpHash = hashLoginOtpCode(otpCode, user._id, config.authOtpSecret);
    const expiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS);
    const updated = await User.updateOne(
      {
        _id: user._id,
        otpHash: user.otpHash,
        otpExpiresAt: mongoose.trusted({ $gt: new Date() }),
        otpAttempts: mongoose.trusted({ $lt: 5 }),
      },
      { $set: { otpHash, otpExpiresAt: expiresAt, otpAttempts: 0 } },
    );
    if (!updated.modifiedCount) {
      return res.status(400).json({ message: "This verification request has expired. Sign in again to request a new code." });
    }
    sendLoginOtpEmailInBackground(user, otpCode, "Resent sign-in verification");
    return res.json({ message: "Your new verification code is on its way to your email." });
  } catch (error) {
    console.error("Resend sign-in code error:", error);
    return res.status(500).json({ message: "Could not resend the verification code. Please try again." });
  }
}

async function handleSendSmsOtp(req, res) {
  try {
    if (config.authOtpSecret.length < 32) {
      return res.status(503).json({ message: "Phone verification is not configured." });
    }

    const phone = normalizePhilippinePhone(String(req.body.phone || "").trim());
    const phoneValues = getPhoneLookupValues(phone);
    const onboardingToken = getPreAuthToken(req);
    const registrationUser = onboardingToken
      ? await findRegistrationPhoneOtpUser(onboardingToken, null)
      : null;
    const user = registrationUser || await User.findOne({
      mobileNumber: mongoose.trusted({ $in: phoneValues }),
      role: mongoose.trusted({ $in: ["client", "provider"] }),
      registrationComplete: true,
      isSuspended: mongoose.trusted({ $ne: true }),
      archivedAt: mongoose.trusted({ $exists: false }),
    }).select("_id");
    if (!user) {
      return res.status(404).json({ message: "No active account was found for that phone number." });
    }

    const otpCode = generateLoginOtpCode();
    const phoneOtpHash = hashLoginOtpCode(otpCode, user._id, config.authOtpSecret);
    const phoneOtpExpiresAt = new Date(Date.now() + LOGIN_OTP_TTL_MS);
    if (registrationUser) {
      user.mobileNumber = `0${phone.slice(3)}`;
      user.phoneVerified = false;
      user.phoneOtpHash = phoneOtpHash;
      user.phoneOtpExpiresAt = phoneOtpExpiresAt;
      user.phoneOtpAttempts = 0;
      await user.save();
    } else {
      const otpSaved = await User.updateOne(
        { _id: user._id, mobileNumber: mongoose.trusted({ $in: phoneValues }) },
        { $set: { phoneOtpHash, phoneOtpExpiresAt, phoneOtpAttempts: 0 } },
      );
      if (!otpSaved.matchedCount) {
        return res.status(409).json({ message: "That phone number changed. Please try again." });
      }
    }

    try {
      await sendSms(phone, otpCode);
    } catch (error) {
      try {
        await User.updateOne(
          { _id: user._id, phoneOtpHash },
          { $unset: { phoneOtpHash: 1, phoneOtpExpiresAt: 1, phoneOtpAttempts: 1 } },
        );
      } catch (cleanupError) {
        console.error("Failed to clear phone verification code after SMS delivery failed:", cleanupError);
      }
      return res.status(502).json({ message: "We could not send the verification SMS. Please try again." });
    }

    return res.status(200).json({ message: "Your verification code has been sent by SMS." });
  } catch (error) {
    console.error("Send phone verification code error:", error);
    return res.status(500).json({ message: "Could not send the verification code. Please try again." });
  }
}

async function handleVerifySmsOtp(req, res) {
  try {
    if (config.authOtpSecret.length < 32) {
      return res.status(503).json({ message: "Phone verification is not configured." });
    }

    const phone = normalizePhilippinePhone(String(req.body.phone || "").trim());
    const phoneValues = getPhoneLookupValues(phone);
    const otpCode = String(req.body.otpCode || "").trim();
    const onboardingToken = getPreAuthToken(req);
    const registrationUser = onboardingToken
      ? await findRegistrationPhoneOtpUser(onboardingToken, phoneValues, true)
      : null;
    const user = registrationUser || await User.findOne({
      mobileNumber: mongoose.trusted({ $in: phoneValues }),
      role: mongoose.trusted({ $in: ["client", "provider"] }),
      registrationComplete: true,
      isSuspended: mongoose.trusted({ $ne: true }),
      archivedAt: mongoose.trusted({ $exists: false }),
    }).select("+phoneOtpHash +phoneOtpExpiresAt +phoneOtpAttempts");
    const now = new Date();
    if (
      !user?.phoneOtpHash ||
      !user.phoneOtpExpiresAt ||
      user.phoneOtpExpiresAt.getTime() <= now.getTime()
    ) {
      return res.status(400).json({ message: "The verification code is invalid or expired." });
    }

    const submittedOtpHash = hashLoginOtpCode(otpCode, user._id, config.authOtpSecret);
    if (!timingSafeOtpHexEqual(user.phoneOtpHash, submittedOtpHash)) {
      const attempt = await User.findOneAndUpdate(
        {
          _id: user._id,
          phoneOtpHash: user.phoneOtpHash,
          phoneOtpExpiresAt: mongoose.trusted({ $gt: now }),
          phoneOtpAttempts: mongoose.trusted({ $lt: 5 }),
          mobileNumber: mongoose.trusted({ $in: phoneValues }),
        },
        { $inc: { phoneOtpAttempts: 1 } },
        { returnDocument: "after" },
      ).select("+phoneOtpAttempts");
      if (!attempt || attempt.phoneOtpAttempts >= 5) {
        return res.status(429).json({ message: "Too many incorrect codes. Request a new verification code." });
      }
      return res.status(400).json({ message: "The verification code is incorrect." });
    }

    const verifiedUser = await User.updateOne(
      {
        _id: user._id,
        phoneOtpHash: user.phoneOtpHash,
        phoneOtpExpiresAt: mongoose.trusted({ $gt: now }),
        phoneOtpAttempts: mongoose.trusted({ $lt: 5 }),
        mobileNumber: mongoose.trusted({ $in: phoneValues }),
      },
      {
        $set: { phoneVerified: true },
        $unset: { phoneOtpHash: 1, phoneOtpExpiresAt: 1, phoneOtpAttempts: 1 },
      },
    );
    if (!verifiedUser.matchedCount) {
      return res.status(400).json({ message: "The verification code is invalid or expired." });
    }

    return res.status(200).json({ message: "Phone number verified successfully.", phoneVerified: true });
  } catch (error) {
    console.error("Phone verification code check failed:", error);
    return res.status(500).json({ message: "Could not verify the phone number. Please try again." });
  }
}

async function handleVerifyAdminLogin(req, res) {
  try {
    const challengeToken = String(req.body.challengeToken || "").trim();
    const code = String(req.body.code || "").trim();
    const primaryAdminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const ipAddress = req.ip || req.socket?.remoteAddress || "unknown";

    if (!primaryAdminEmail || config.adminOtpSecret.length < 32) {
      return res.status(503).json({ message: "Admin email verification is not configured." });
    }

    const ipLimit = await adminLoginSecurity.consumeAdminRateLimit("otp-verify-ip", ipAddress, 15, 15 * 60 * 1000);
    if (!ipLimit.allowed) return rejectAdminRateLimit(res, ipLimit.retryAfterSeconds);

    const now = new Date();
    const challenge = await AdminLoginChallenge.findOne({
      challengeTokenHash: hashAdminChallengeToken(challengeToken),
      expiresAt: mongoose.trusted({ $gt: now }),
      consumedAt: null,
      attempts: mongoose.trusted({ $lt: 5 }),
    }).select("+codeHash");
    const adminEmail = challenge?.adminEmail;
    if (adminEmail) req.adminEmail = adminEmail;
    if (!challenge || !/^\d{6}$/.test(code)) {
      void logAuditAction(req, {
        category: "SECURITY",
        action: "FAILED_LOGIN_ATTEMPT",
        targetResource: "AdminAccount",
        ...(adminEmail ? { targetId: adminEmail } : {}),
        details: "Administrator verification code was invalid or expired.",
      });
      return res.status(400).json({ message: "The verification code is invalid or expired. Sign in again to request a new one." });
    }

    let adminAccount = null;
    let otpDestination = config.adminOtpEmail;
    if (adminEmail !== primaryAdminEmail) {
      adminAccount = await User.findOne({
        email: adminEmail,
        role: "admin",
        isSuspended: mongoose.trusted({ $ne: true }),
        archivedAt: mongoose.trusted({ $exists: false }),
      }).select("_id email adminContactEmail fullName username");
      if (!adminAccount) {
        await AdminLoginChallenge.deleteOne({ _id: challenge._id });
        return res.status(401).json({ message: "This admin account is unavailable. Sign in again or contact the primary admin." });
      }
      req.adminId = adminAccount._id;
      req.adminName = adminAccount.fullName || adminAccount.username || adminAccount.email;
      otpDestination = adminAccount.adminContactEmail || adminAccount.email;
    }
    if (!otpDestination || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(otpDestination)) {
      return res.status(503).json({ message: "Admin email verification is not configured." });
    }

    const submittedCodeHash = hashAdminLoginCode(code, config.adminOtpSecret);
    if (!timingSafeHexEqual(challenge.codeHash, submittedCodeHash)) {
      const updatedChallenge = await AdminLoginChallenge.findOneAndUpdate(
        {
          _id: challenge._id,
          expiresAt: mongoose.trusted({ $gt: now }),
          consumedAt: null,
          attempts: mongoose.trusted({ $lt: 5 }),
        },
        { $inc: { attempts: 1 } },
        { returnDocument: "after" }
      );
      if (!updatedChallenge || updatedChallenge.attempts >= 5) {
        void logAuditAction(req, {
          category: "SECURITY",
          action: "FAILED_LOGIN_ATTEMPT",
          targetResource: "AdminAccount",
          targetId: adminEmail,
          details: "Administrator verification code attempts exceeded the allowed limit.",
        });
        return res.status(429).json({ message: "Too many incorrect codes. Sign in again to request a new one." });
      }
      void logAuditAction(req, {
        category: "SECURITY",
        action: "FAILED_LOGIN_ATTEMPT",
        targetResource: "AdminAccount",
        targetId: adminEmail,
        details: "Administrator verification code was incorrect.",
      });
      return res.status(400).json({ message: "The verification code is incorrect." });
    }

    const consumedChallenge = await AdminLoginChallenge.findOneAndUpdate(
      {
        _id: challenge._id,
        adminEmail,
        challengeTokenHash: hashAdminChallengeToken(challengeToken),
        codeHash: submittedCodeHash,
        expiresAt: mongoose.trusted({ $gt: now }),
        consumedAt: null,
        attempts: mongoose.trusted({ $lt: 5 }),
      },
      { $set: { consumedAt: now } },
      { returnDocument: "after" }
    );
    if (!consumedChallenge) {
      return res.status(400).json({ message: "The verification code is invalid or expired. Sign in again to request a new one." });
    }

    const adminToken = randomBytes(32).toString("hex");
    await AdminSession.create({
      adminEmail,
      tokenHash: hashToken(adminToken),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    });
    void logAuditAction(req, {
      category: "SECURITY",
      action: "ADMIN_LOGIN",
      targetResource: "AdminSession",
      details: "Administrator completed multi-factor sign-in.",
    });
    return res.json({
      message: "Login successful.",
      token: adminToken,
      role: "admin",
      user: {
        ...(adminAccount?._id ? { id: String(adminAccount._id) } : {}),
        email: adminEmail,
        fullName: adminAccount?.fullName || adminAccount?.username || adminEmail,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Admin verification error:", error);
    return res.status(500).json({ message: "Admin verification failed. Please try again." });
  }
}

async function handleForgotPassword(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  try {
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: "Enter a valid email address." });
    const user = await User.findOne({ email }).select("+adminContactEmail");
    if (!user) return res.status(404).json({ message: "This email is not registered in the system." });
    if (!mailer.hasValidSmtpCredentials || !config.appUrl) {
      return res.status(503).json({ message: "Password reset email delivery is not configured. Set SMTP_USER, SMTP_PASSWORD, and APP_URL." });
    }

    const deliveryEmail = user.role === "admin" ? user.adminContactEmail || user.email : user.email;
    const code = String(randomInt(100000, 1000000));
    const tokenHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await User.updateOne({ _id: user._id }, {
      $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt, passwordResetAttempts: 0 },
    });
    try {
      await mailer.sendPasswordResetEmail(deliveryEmail, code, user.email);
    } catch (deliveryError) {
      await User.updateOne({ _id: user._id, passwordResetTokenHash: tokenHash }, {
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetAttempts: 1 },
      });
      throw deliveryError;
    }
    return res.json({ message: "If an account exists for that email, a reset code is on its way." });
  } catch (error) {
    console.error("Forgot password error:", error);
    return res.status(502).json({ message: "We could not send the reset email. Please try again." });
  }
}

async function handleVerifyPasswordResetCode(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpiresAt +passwordResetAttempts");
    if (!user?.passwordResetTokenHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) {
      return res.status(400).json({ message: "The reset code is missing or expired." });
    }
    if (user.passwordResetAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      return res.status(400).json({ message: "Too many incorrect reset codes. Request a new reset code to try again." });
    }
    if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, user.passwordResetTokenHash))) {
      const attemptRecorded = await recordFailedPasswordResetAttempt(user);
      return res.status(400).json({
        message: attemptRecorded
          ? "The reset code is incorrect."
          : "The reset code is missing, expired, or has too many incorrect attempts. Request a new reset code.",
      });
    }
    return res.json({ message: "Reset code verified." });
  } catch (error) {
    console.error("Verify password reset code error:", error);
    return res.status(500).json({ message: "Could not verify the reset code. Please try again." });
  }
}

async function handleResetPassword(req, res) {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const code = String(req.body.code || "").trim();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpiresAt +passwordResetAttempts");
    if (!user?.passwordResetTokenHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) {
      return res.status(400).json({ message: "The reset code is missing or expired." });
    }
    if (user.passwordResetAttempts >= PASSWORD_RESET_MAX_ATTEMPTS) {
      return res.status(400).json({ message: "Too many incorrect reset codes. Request a new reset code to try again." });
    }
    if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, user.passwordResetTokenHash))) {
      const attemptRecorded = await recordFailedPasswordResetAttempt(user);
      return res.status(400).json({
        message: attemptRecorded
          ? "The reset code is incorrect."
          : "The reset code is missing, expired, or has too many incorrect attempts. Request a new reset code.",
      });
    }

    if (!user || (await bcrypt.compare(password, user.passwordHash))) return res.status(400).json({ message: "Your new password must be different from your previous password." });
    const passwordRequirements = [];
    if (password.length < 8) passwordRequirements.push("at least 8 characters");
    if (password.length > 15) passwordRequirements.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) passwordRequirements.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) passwordRequirements.push("one special character");
    if (passwordRequirements.length) return res.status(400).json({ message: `Password needs ${passwordRequirements.join(", ")}.` });

    const resetResult = await User.updateOne(
      {
        ...passwordResetAttemptQuery(user),
      },
      {
        $set: { passwordHash: await bcrypt.hash(password, 10) },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1, passwordResetAttempts: 1 },
      }
    );
    if (!resetResult.matchedCount) return res.status(400).json({ message: "The reset code is missing or expired." });
    clearLoginAttempts(email);
    sendPasswordChangedNotification(user.email);
    return res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Password reset failed. Please try again." });
  }
}

async function handleCompleteAdminSetup(req, res) {
  const email = String(req.body.email || "").trim().toLowerCase();
  const setupToken = String(req.body.setupToken || "").trim();
  const password = String(req.body.password || "");
  try {
    const user = await User.findOne({ email, role: "admin" })
      .select("+adminSetupTokenHash +adminSetupExpiresAt");
    if (
      !user?.adminSetupTokenHash
      || !user.adminSetupExpiresAt
      || user.adminSetupExpiresAt <= new Date()
      || !timingSafeHexEqual(user.adminSetupTokenHash, hashToken(setupToken))
    ) {
      return res.status(400).json({ message: "This admin setup link is invalid or expired. Return to sign in and use Forgot password to request a new setup link." });
    }

    const passwordRequirements = [];
    if (password.length < 8) passwordRequirements.push("at least 8 characters");
    if (password.length > 15) passwordRequirements.push("no more than 15 characters");
    if (!/[A-Z]/.test(password)) passwordRequirements.push("one uppercase letter");
    if (!/[^A-Za-z0-9]/.test(password)) passwordRequirements.push("one special character");
    if (passwordRequirements.length) {
      return res.status(400).json({ message: `Password needs ${passwordRequirements.join(", ")}.` });
    }

    const now = new Date();
    const updateResult = await User.updateOne({
      _id: user._id,
      role: "admin",
      adminSetupTokenHash: user.adminSetupTokenHash,
      adminSetupExpiresAt: mongoose.trusted({ $gt: now }),
    }, {
      $set: { passwordHash: await bcrypt.hash(password, 12) },
      $unset: { adminSetupTokenHash: 1, adminSetupExpiresAt: 1 },
    });
    if (!updateResult.matchedCount) {
      return res.status(400).json({ message: "This admin setup link is invalid or expired. Return to sign in and use Forgot password to request a new setup link." });
    }

    req.adminEmail = email;
    req.adminId = user._id;
    req.adminName = user.fullName || email;
    void logAuditAction(req, {
      category: "SECURITY",
      action: "ADMIN_ACCOUNT_SETUP_COMPLETED",
      targetResource: "AdminAccount",
      targetId: user._id,
      details: "Administrator completed the one-time account password setup.",
    });
    clearLoginAttempts(email);
    return res.json({ message: "Admin password set successfully. You can now sign in." });
  } catch (error) {
    console.error("Admin account setup failed:", error);
    return res.status(500).json({ message: "Could not set up the admin password. Please try again." });
  }
}

module.exports = {
  handleRegister,
  handleRegistrationAvailability,
  handleResumeRegistration,
  handleRegistrationStatus,
  handleRegistrationTabClosed,
  handleVerifyEmail,
  handleResendVerification,
  handleCompleteRegistration,
  handleLogin,
  handleVerifyLoginOtp,
  handleResendLoginOtp,
  handleSendSmsOtp,
  handleVerifySmsOtp,
  handleLogout,
  handleAdminLogout,
  handleVerifyAdminLogin,
  handleForgotPassword,
  handleVerifyPasswordResetCode,
  handleResetPassword,
  handleCompleteAdminSetup,
};