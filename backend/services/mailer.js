const nodemailer = require("nodemailer");
const config = require("../config/env");

const hasValidSmtpCredentials =
  config.smtpUser.length > 0 &&
  config.smtpPassword.length > 0 &&
  !/(yourgmail|example|app_password|replace)/i.test(config.smtpUser) &&
  !/(yourgmail|example|app_password|replace)/i.test(config.smtpPassword);

const mailTransport = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  requireTLS: true,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
  auth: hasValidSmtpCredentials
    ? { user: config.smtpUser, pass: config.smtpPassword }
    : undefined,
});

if (process.env.VERCEL) {
  console.log("SMTP status:", {
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    configured: hasValidSmtpCredentials,
    from: config.mailFrom || "missing",
  });
}

async function sendPasswordResetEmail(email, code) {
  const result = await mailTransport.sendMail({
    from: { name: "TaskPanda", address: config.mailFrom || config.smtpUser },
    to: email,
    subject: "Reset your TaskPanda password",
    text: `Your TaskPanda password reset code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your TaskPanda password reset code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${code}</p><p>This code expires in 10 minutes.</p>`,
  });
  console.log("Password reset email accepted by SMTP:", {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
    response: result.response,
  });
}

async function sendEmailVerificationEmail(email, verificationUrl) {
  const result = await mailTransport.sendMail({
    from: { name: "TaskPanda", address: config.mailFrom || config.smtpUser },
    to: email,
    subject: "Verify your TaskPanda email",
    text: `Verify your email to continue your TaskPanda registration: ${verificationUrl}\nThis link expires in 24 hours.`,
    html: `<p>Verify your email to continue your TaskPanda registration:</p><p><a href="${verificationUrl}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
  console.log("Email verification message accepted by SMTP:", {
    messageId: result.messageId,
    accepted: result.accepted,
    rejected: result.rejected,
  });
}

module.exports = { hasValidSmtpCredentials, sendPasswordResetEmail, sendEmailVerificationEmail };