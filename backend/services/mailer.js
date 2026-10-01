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

async function sendAdminLoginOtpEmail(email, code) {
  const result = await mailTransport.sendMail({
    from: { name: "TaskPanda", address: config.mailFrom || config.smtpUser },
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

module.exports = { hasValidSmtpCredentials, sendAdminLoginOtpEmail };