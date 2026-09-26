const bcrypt = require("bcryptjs");
const { createHash, randomBytes } = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/User");
const PasswordReset = require("../models/PasswordReset");
const config = require("../config/env");
const { geocodeAddress } = require("../services/geocoder");
const {
  hasValidSmtpCredentials,
  sendPasswordResetEmail,
  sendEmailVerificationEmail,
} = require("../services/mailer");
const {
  getLoginLock,
  recordFailedLogin,
  clearLoginAttempts,
  loginLockResponse,
} = require("../middleware/authAttempts");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const registrationSessionCookie = "taskpanda_registration";

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

    if (!username) {
      return res.status(400).json({ message: "Username is required." });
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

    const user = await User.create({
      role,
      username,
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

  const onboardingToken = await issueOnboardingToken(user._id);
  if (!onboardingToken) {
    return res.status(409).json({ message: "Your registration has changed. Please start again." });
  }
  await createRegistrationSession(user, res);
  return res.json({
    message: "Email verified successfully. Continue your registration in the original tab.",
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

    if (!user.emailVerified || !user.registrationVerificationClosedAt) {
      return res.json({
        verified: user.emailVerified === true,
        verificationTabClosed: Boolean(user.registrationVerificationClosedAt),
      });
    }

    const claimedUser = await User.findOneAndUpdate(
      mongoose.trusted({
        _id: user._id,
        ...sessionFilter,
        emailVerified: true,
        registrationComplete: false,
        registrationVerificationClosedAt: mongoose.trusted({ $exists: true }),
        registrationResumeClaimedAt: mongoose.trusted({ $exists: false }),
      }),
      { $set: { registrationResumeClaimedAt: new Date() } },
      { new: true }
    );
    if (!claimedUser) return res.json({ verified: true, verificationTabClosed: true, alreadyResumed: true });

    const onboardingToken = await issueOnboardingToken(claimedUser._id);
    if (!onboardingToken) {
      return res.status(409).json({ message: "Registration is no longer available." });
    }

    return res.json({
      verified: true,
      verificationTabClosed: true,
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

  const user = await User.findOne({ email, emailVerified: false, registrationComplete: false }).select(
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
  const mobileNumber = String(req.body.mobileNumber || "").trim();
  const province = String(req.body.province || "").trim();
  const city = String(req.body.city || "").trim();
  const barangay = String(req.body.barangay || "").trim();
  const address = formatAddress(req.body.address, barangay, city, province);
  let geoLocation = address ? await geocodeAddress(address, { barangay, city, province }) : null;
  geoLocation ||= normalizeGeoLocation(req.body.geoLocation);
  if (req.body.geoLocation != null && !normalizeGeoLocation(req.body.geoLocation) && !geoLocation) {
    return res.status(400).json({ message: "Choose a valid map location." });
  }
  const dateOfBirth = String(req.body.dateOfBirth || "").trim();
  if (!fullName) return res.status(400).json({ message: "Your full name is required." });
  if (!/^09\d{9}$/.test(mobileNumber)) {
    return res.status(400).json({ message: "Enter a valid 11-digit mobile number starting with 09." });
  }

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
        createdAt: user.createdAt,
        role: user.role,
        emailVerified: user.emailVerified !== false,
        registrationComplete: user.registrationComplete !== false,
      },
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

module.exports = {
  handleRegister,
  handleRegistrationAvailability,
  handleRegistrationStatus,
  handleRegistrationTabClosed,
  handleVerifyEmail,
  handleResendVerification,
  handleCompleteRegistration,
  handleLogin,
  handleForgotPassword,
  handleResetPassword,
};