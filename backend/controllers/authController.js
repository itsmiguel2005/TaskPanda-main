const bcrypt = require("bcryptjs");
const { createHash, randomBytes, randomInt } = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const AdminSession = require("../models/AdminSession");
const AdminLoginChallenge = require("../models/AdminLoginChallenge");
const config = require("../config/env");
const { geocodeAddress } = require("../services/geocoder");
const { createReferralCode, creditReferralRewards } = require("../services/rewards");
const {
  hasValidSmtpCredentials,
  sendAdminLoginOtpEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
} = require("../services/mailer");
const {
  sendPushNotification,
} = require("../services/oneSignal");
const {
  generateAdminLoginCode,
  hashAdminLoginCode,
  hashAdminChallengeToken,
  timingSafeHexEqual,
  consumeAdminRateLimit,
} = require("../services/adminLoginSecurity");
const {
  getLoginLock,
  recordFailedLogin,
  clearLoginAttempts,
  loginLockResponse,
} = require("../middleware/authAttempts");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const registrationSessionCookie = "taskpanda_registration";
const ADMIN_LOGIN_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const personNamePattern = /^[\p{L}\p{M}]+(?:[ .'-][\p{L}\p{M}]+)*$/u;

function normalizePhilippineMobile(value) {
  if (/^09\d{9}$/.test(value)) return value;
  if (/^\+639\d{9}$/.test(value)) return `0${value.slice(3)}`;
  return "";
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
  await User.updateOne(
    { _id: userId },
    {
      $push: {
        accountTokens: {
          $each: [{
            tokenHash: hashToken(token),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          }],
          $slice: -5,
        },
      },
    }
  );
  return token;
}

async function issueEmailVerification(user, { replaceExisting = false, appUrl = config.appUrl } = {}) {
  if (!hasValidSmtpCredentials || !appUrl) {
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
  await sendEmailVerificationEmail(user.email, verificationUrl.toString());
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
        if (
          referralOwner &&
          existingEmailUser.referredBy &&
          String(existingEmailUser.referredBy) !== String(referralOwner._id)
        ) {
          return res.status(409).json({ message: "A different referral code is already attached to this registration." });
        }
        if (referralOwner && !existingEmailUser.referredBy) {
          existingEmailUser.referredBy = referralOwner._id;
          await existingEmailUser.save();
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
      ...(referralOwner ? { referredBy: referralOwner._id } : {}),
      email,
      passwordHash: await bcrypt.hash(password, 10),
      professions: role === "provider" ? professions : [],
      emailVerified: false,
      registrationComplete: false,
      registrationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

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
    const claimAvailable = mongoose.trusted({
      $or: [
        { registrationResumeClaimedAt: mongoose.trusted({ $exists: false }) },
        { registrationResumeClaimedAt: mongoose.trusted({ $lt: new Date(Date.now() - 10 * 60 * 1000) }) },
      ],
    });
    const claimedUser = await User.findOneAndUpdate(
      mongoose.trusted({
        _id: user._id,
        ...sessionFilter,
        emailVerified: true,
        registrationComplete: false,
        ...claimAvailable,
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
  const address = formatAddress(req.body.address, barangay, city, province);
  let geoLocation = address ? await geocodeAddress(address, { barangay, city, province }) : null;
  geoLocation ||= normalizeGeoLocation(req.body.geoLocation);
  if (req.body.geoLocation != null && !normalizeGeoLocation(req.body.geoLocation) && !geoLocation) {
    return res.status(400).json({ message: "Choose a valid map location." });
  }
  const dateOfBirth = String(req.body.dateOfBirth || "").trim();

  let parsedDateOfBirth;
  if (user.role === "provider") {
    if (!geoLocation || !Array.isArray(geoLocation.coordinates) || geoLocation.coordinates.length !== 2) {
      return res.status(400).json({ message: "Use your current location so nearby clients can find your profile." });
    }
    parsedDateOfBirth = new Date(`${dateOfBirth}T00:00:00.000Z`);
    const today = new Date();
    const age = today.getUTCFullYear() - parsedDateOfBirth.getUTCFullYear() - (
      today.getUTCMonth() < parsedDateOfBirth.getUTCMonth() ||
      (today.getUTCMonth() === parsedDateOfBirth.getUTCMonth() && today.getUTCDate() < parsedDateOfBirth.getUTCDate())
        ? 1
        : 0
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || Number.isNaN(parsedDateOfBirth.getTime()) || age < 18) {
      return res.status(400).json({ message: "Providers must be at least 18 years old." });
    }
    if (!user.professions.length) {
      return res.status(400).json({ message: "Select at least one profession to continue." });
    }
  }

  user.referralCode ||= user.role === "client" ? createReferralCode(user._id) : undefined;
  await creditReferralRewards(user);

  const updatedUser = await User.findOneAndUpdate(
    mongoose.trusted({
      _id: user._id,
      ...onboardingTokenFilter(tokenHash),
      emailVerified: true,
      registrationComplete: false,
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
        ...(user.role === "provider" ? { dateOfBirth: parsedDateOfBirth } : {}),
      },
      $unset: {
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
      bio: updatedUser.bio,
      createdAt: updatedUser.createdAt,
      role: updatedUser.role,
      referralCode: updatedUser.referralCode,
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
      const ipAddress = req.ip || req.socket?.remoteAddress || "unknown";
      const [credentialIpLimit, credentialAccountLimit] = await Promise.all([
        consumeAdminRateLimit("credential-ip", ipAddress, 10, 15 * 60 * 1000),
        consumeAdminRateLimit("credential-account", adminEmail, 10, 15 * 60 * 1000),
      ]);
      if (!credentialIpLimit.allowed) return rejectAdminRateLimit(res, credentialIpLimit.retryAfterSeconds);
      if (!credentialAccountLimit.allowed) return rejectAdminRateLimit(res, credentialAccountLimit.retryAfterSeconds);

      if (password !== adminPassword) {
        const attempt = recordFailedLogin(normalizedIdentifier);
        if (attempt.lockedUntil) return loginLockResponse(res, attempt);
        return res.status(401).json({ message: "Invalid admin credentials. Please try again." });
      }

      if (!config.adminOtpEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.adminOtpEmail)) {
        return res.status(503).json({ message: "Admin email verification is not configured." });
      }
      if (config.adminOtpSecret.length < 32 || !hasValidSmtpCredentials) {
        return res.status(503).json({ message: "Admin email verification is not configured." });
      }

      const [sendIpLimit, sendEmailLimit] = await Promise.all([
        consumeAdminRateLimit("otp-send-ip", ipAddress, 3, 15 * 60 * 1000),
        consumeAdminRateLimit("otp-send-email", config.adminOtpEmail, 3, 15 * 60 * 1000),
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
        { new: true, upsert: true }
      );
      try {
        await sendAdminLoginOtpEmail(config.adminOtpEmail, code);
      } catch (mailError) {
        await AdminLoginChallenge.deleteOne({ adminEmail, challengeTokenHash });
        console.error("Admin sign-in email could not be sent:", mailError.message);
        return res.status(502).json({ message: "Could not send the admin verification code. Please try again." });
      }
      try {
        await sendPushNotification({
          roles: ["admin"],
          title: "Admin sign-in requested",
          body: "A new administrator verification code was requested. The code is not included in this alert.",
          url: "/admin?section=dashboard",
          data: { event: "admin.otp_requested" },
        });
      } catch (pushError) {
        console.warn("OneSignal admin OTP alert failed:", pushError.message);
      }

      clearLoginAttempts(normalizedIdentifier);
      return res.json({
        message: "A verification code was sent to the configured admin email.",
        requiresAdminOtp: true,
        challengeToken,
      });
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
    if (user.isSuspended || user.archivedAt) {
      return res.status(403).json({ message: "This account is unavailable. Contact TaskPanda support for assistance." });
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

    clearLoginAttempts(normalizedIdentifier);
    const accountToken = await issueAccountToken(user._id);
    return res.json({
      message: "Login successful.", token: accountToken, role: user.role,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        firstName: user.firstName,
        middleName: user.middleName,
        lastName: user.lastName,
        mobileNumber: user.mobileNumber,
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
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Login failed. Please try again." });
  }
}

async function handleVerifyAdminLogin(req, res) {
  try {
    const challengeToken = String(req.body.challengeToken || "").trim();
    const code = String(req.body.code || "").trim();
    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const ipAddress = req.ip || req.socket?.remoteAddress || "unknown";

    if (!adminEmail || config.adminOtpSecret.length < 32) {
      return res.status(503).json({ message: "Admin email verification is not configured." });
    }

    const ipLimit = await consumeAdminRateLimit("otp-verify-ip", ipAddress, 15, 15 * 60 * 1000);
    if (!ipLimit.allowed) return rejectAdminRateLimit(res, ipLimit.retryAfterSeconds);

    const now = new Date();
    const challenge = await AdminLoginChallenge.findOne({
      adminEmail,
      challengeTokenHash: hashAdminChallengeToken(challengeToken),
      expiresAt: mongoose.trusted({ $gt: now }),
      consumedAt: null,
      attempts: mongoose.trusted({ $lt: 5 }),
    }).select("+codeHash");
    if (!challenge || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ message: "The verification code is invalid or expired. Sign in again to request a new one." });
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
        { new: true }
      );
      if (!updatedChallenge || updatedChallenge.attempts >= 5) {
        return res.status(429).json({ message: "Too many incorrect codes. Sign in again to request a new one." });
      }
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
      { new: true }
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
    try {
      await sendPushNotification({
        roles: ["admin"],
        title: "Admin sign-in completed",
        body: "A new administrator session was started.",
        url: "/admin?section=dashboard",
        data: { event: "admin.sign_in" },
      });
    } catch (pushError) {
      console.warn("OneSignal admin security alert failed:", pushError.message);
    }
    return res.json({
      message: "Login successful.",
      token: adminToken,
      role: "admin",
      user: { email: adminEmail, role: "admin" },
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
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "This email is not registered in the system." });
    if (!hasValidSmtpCredentials || !config.appUrl) {
      return res.status(503).json({ message: "Password reset email delivery is not configured. Set SMTP_USER, SMTP_PASSWORD, and APP_URL." });
    }

    const code = String(randomInt(100000, 1000000));
    const tokenHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await User.updateOne({ _id: user._id }, {
      $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt },
    });
    try {
      await sendPasswordResetEmail(email, code);
    } catch (error) {
      await User.updateOne({ _id: user._id, passwordResetTokenHash: tokenHash }, {
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      });
      throw error;
    }
    return res.json({ message: "If an account exists for that email, a reset code has been sent." });
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
    const user = await User.findOne({ email }).select("+passwordResetTokenHash +passwordResetExpiresAt");
    if (!user?.passwordResetTokenHash || !user.passwordResetExpiresAt || user.passwordResetExpiresAt <= new Date()) {
      return res.status(400).json({ message: "The reset code is missing or expired." });
    }
    if (!/^\d{6}$/.test(code) || !(await bcrypt.compare(code, user.passwordResetTokenHash))) {
      return res.status(400).json({ message: "The reset code is incorrect." });
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
        _id: user._id,
        passwordResetTokenHash: user.passwordResetTokenHash,
        passwordResetExpiresAt: mongoose.trusted({ $gt: new Date() }),
      },
      {
        $set: { passwordHash: await bcrypt.hash(password, 10) },
        $unset: { passwordResetTokenHash: 1, passwordResetExpiresAt: 1 },
      }
    );
    if (!resetResult.matchedCount) return res.status(400).json({ message: "The reset code is missing or expired." });
    clearLoginAttempts(email);
    return res.json({ message: "Password reset successfully." });
  } catch (error) {
    console.error("Reset password error:", error);
    return res.status(500).json({ message: "Password reset failed. Please try again." });
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
  handleVerifyAdminLogin,
  handleForgotPassword,
  handleResetPassword,
};