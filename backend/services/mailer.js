const nodemailer = require("nodemailer");
const config = require("../config/env");

const hasValidSmtpCredentials =
  config.smtpUser.length > 0 &&
  config.smtpPassword.length > 0 &&
  !/(yourgmail|example|app_password|replace)/i.test(config.smtpUser) &&
  !/(yourgmail|example|app_password|replace)/i.test(config.smtpPassword);

const configuredMailFrom = config.mailFrom || config.smtpUser;
const hasAlignedMailFrom = configuredMailFrom.toLowerCase() === config.smtpUser.toLowerCase();
const mailFrom = hasAlignedMailFrom ? configuredMailFrom : config.smtpUser;
if (config.mailFrom && !hasAlignedMailFrom) {
  console.warn("MAIL_FROM does not match SMTP_USER. Using SMTP_USER as the sender to avoid sender spoofing.");
}

const taskPandaSender = { name: "TaskPanda", address: mailFrom };
const transientSmtpErrorCodes = new Set([
  "ECONNECTION",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ESOCKET",
  "ETIMEDOUT",
]);

const mailTransport = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  pool: !process.env.VERCEL,
  requireTLS: true,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: hasValidSmtpCredentials
    ? { user: config.smtpUser, pass: config.smtpPassword }
    : undefined,
});

async function sendVerificationMailWithRetry(sendMail) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await sendMail();
    } catch (error) {
      const retryable = transientSmtpErrorCodes.has(error.code)
        || (Number(error.responseCode) >= 400 && Number(error.responseCode) < 500);
      if (!retryable || attempt === 2) throw error;
      console.warn("Temporary SMTP failure while sending verification email; retrying once:", {
        code: error.code || "",
        responseCode: error.responseCode || 0,
      });
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  throw new Error("Verification email could not be sent.");
}

if (process.env.VERCEL) {
  console.log("SMTP status:", {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    configured: hasValidSmtpCredentials,
    fromAligned: hasAlignedMailFrom,
  });
}

async function sendPasswordResetEmail(email, code) {
  const resetUrl = new URL("/forgot-password", `${config.appUrl}/`);
  resetUrl.searchParams.set("email", String(email).trim().toLowerCase());
  resetUrl.searchParams.set("code", code);
  const result = await mailTransport.sendMail({
    from: taskPandaSender,
    to: email,
    subject: "Reset your TaskPanda password",
    text: `Your TaskPanda password reset code is ${code}. It expires in 10 minutes.\n\nReset your password: ${resetUrl.toString()}`,
    html: `<p>Your TaskPanda password reset code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${code}</p><p>This code expires in 10 minutes.</p><p><a href="${resetUrl.toString()}">Reset your password</a></p>`,
  });
  console.log("Password reset email accepted by SMTP:", {
    messageId: result.messageId,
    acceptedCount: result.accepted?.length || 0,
    rejectedCount: result.rejected?.length || 0,
  });
}

async function sendEmailVerificationEmail(email, verificationUrl) {
  const result = await sendVerificationMailWithRetry(() => mailTransport.sendMail({
      from: taskPandaSender,
      to: email,
      subject: "Verify your TaskPanda email",
      text: `Verify your email to continue your TaskPanda registration: ${verificationUrl}\nThis link expires in 24 hours.`,
      html: `<p>Verify your email to continue your TaskPanda registration:</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    }));
  const acceptedRecipients = (result.accepted || []).map((recipient) =>
    String(typeof recipient === "string" ? recipient : recipient.address || "").trim().toLowerCase()
  );
  if (!acceptedRecipients.includes(String(email).trim().toLowerCase())) {
    console.error("SMTP did not accept the verification email recipient:", {
      acceptedCount: acceptedRecipients.length,
      rejectedCount: result.rejected?.length || 0,
    });
    throw new Error("The email provider did not accept the verification message.");
  }
  console.log("Email verification message accepted by SMTP:", {
    messageId: result.messageId,
    acceptedCount: acceptedRecipients.length,
    rejectedCount: result.rejected?.length || 0,
  });
}

async function sendAdminLoginOtpEmail(email, code) {
  const result = await mailTransport.sendMail({
    from: taskPandaSender,
    to: email,
    subject: "Your TaskPanda admin sign-in code",
    text: `Your TaskPanda admin sign-in code is ${code}. It expires in 5 minutes. If you did not request this code, secure your admin credentials immediately.`,
    html: `<p>Your TaskPanda admin sign-in code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${code}</p><p>This code expires in 5 minutes. If you did not request this code, secure your admin credentials immediately.</p>`,
  });
  console.log("Admin sign-in code accepted by SMTP:", {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
  });
}

async function sendOtpEmail(email, code, name) {
  const greeting = String(name || "").trim() || "there";
  const htmlGreeting = greeting.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]);
  const result = await mailTransport.sendMail({
    from: taskPandaSender,
    to: email,
    subject: "Your TaskPanda sign-in code",
    text: `Hi ${greeting}, your TaskPanda sign-in code is ${code}. It expires in 5 minutes. If you did not request this code, you can ignore this email.`,
    html: `<p>Hi ${htmlGreeting},</p><p>Your TaskPanda sign-in code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${code}</p><p>This code expires in 5 minutes. If you did not request this code, you can ignore this email.</p>`,
  });
  console.log("Sign-in code accepted by SMTP:", {
    messageId: result.messageId,
    acceptedCount: result.accepted?.length || 0,
    rejectedCount: result.rejected?.length || 0,
  });
}

module.exports = {
  hasValidSmtpCredentials,
  sendVerificationMailWithRetry,
  sendAdminLoginOtpEmail,
  sendOtpEmail,
  sendEmailVerificationEmail,
  sendPasswordResetEmail,
};