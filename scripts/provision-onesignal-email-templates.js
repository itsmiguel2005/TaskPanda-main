const {
  createEmailTemplate,
  listEmailTemplates,
} = require("../backend/services/oneSignal");

const templatesToProvision = [
  {
    key: "verification",
    name: "TaskPanda Email Verification",
    email_subject: "Verify your TaskPanda email",
    email_preheader: "Complete email verification to finish setting up your account.",
    email_body: [
      "<html><body style=\"font-family:Arial,sans-serif;color:#20252b\">",
      "<h1>Verify your email</h1>",
      "<p>Use the link below to verify your TaskPanda email address. This link expires in 24 hours.</p>",
      "<p><a href=\"{{ message.custom_data.verification_url }}\">Verify email</a></p>",
      "<p>If you did not create a TaskPanda account, you can ignore this email.</p>",
      "</body></html>",
    ].join(""),
  },
  {
    key: "reset",
    name: "TaskPanda Password Reset",
    email_subject: "Reset your TaskPanda password",
    email_preheader: "Your password reset code expires in 10 minutes.",
    email_body: [
      "<html><body style=\"font-family:Arial,sans-serif;color:#20252b\">",
      "<h1>Password reset</h1>",
      "<p>Use the secure link or enter this code in TaskPanda to reset your password:</p>",
      "<p><a href=\"{{ message.custom_data.reset_url }}\">Reset password</a></p>",
      "<p style=\"font-size:28px;font-weight:700;letter-spacing:4px\">{{ message.custom_data.otp }}</p>",
      "<p>This code expires in 10 minutes. If you did not request a password reset, ignore this email.</p>",
      "</body></html>",
    ].join(""),
  },
];

async function main() {
  const existingTemplates = [];
  for (let offset = 0; ; offset += 50) {
    const result = await listEmailTemplates(offset);
    existingTemplates.push(...(Array.isArray(result.templates) ? result.templates : []));
    if (existingTemplates.length >= Number(result.total_count || 0) || !result.templates?.length) break;
  }

  for (const template of templatesToProvision) {
    const existing = existingTemplates.find((item) => item.name === template.name);
    const result = existing || await createEmailTemplate(template);
    console.log(`${template.key.toUpperCase()}_TEMPLATE_ID=${result.id}`);
  }
}

main().catch((error) => {
  console.error("Could not provision OneSignal email templates:", error.message);
  process.exitCode = 1;
});