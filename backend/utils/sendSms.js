const TEXTBEE_SEND_SMS_URL = "https://api.textbee.dev/api/v1/gateway/send-sms";

function normalizePhilippinePhone(phone) {
  const value = String(phone || "").trim();
  if (/^09\d{9}$/.test(value)) return `+639${value.slice(2)}`;
  if (/^\+?639\d{9}$/.test(value)) return value.startsWith("+") ? value : `+${value}`;
  throw new Error("A valid Philippine mobile number is required.");
}

async function sendSms(phone, otpCode) {
  try {
    const apiKey = String(process.env.TEXTBEE_API_KEY || "").trim();
    if (!apiKey) throw new Error("TEXTBEE_API_KEY is not configured.");

    const formattedPhone = normalizePhilippinePhone(phone);
    const response = await fetch(TEXTBEE_SEND_SMS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        recipients: [formattedPhone],
        message: `[TaskPanda] Your verification code is ${otpCode}. Valid for 5 minutes.`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`TextBee rejected the SMS request (HTTP ${response.status}).`);
    }
  } catch (error) {
    console.error("TextBee SMS delivery failed; the Android gateway may be offline:", error.message);
    throw error;
  }
}

module.exports = { normalizePhilippinePhone, sendSms };
