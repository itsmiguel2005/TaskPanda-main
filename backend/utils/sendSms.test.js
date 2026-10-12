const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhilippinePhone, sendSms } = require("./sendSms");

test("normalizes Philippine mobile numbers for TextBee", () => {
  assert.equal(normalizePhilippinePhone("09171234567"), "+639171234567");
  assert.equal(normalizePhilippinePhone("639171234567"), "+639171234567");
  assert.equal(normalizePhilippinePhone("+639171234567"), "+639171234567");
  assert.throws(() => normalizePhilippinePhone("08171234567"), /valid Philippine mobile number/);
});

test("sends the required TextBee payload and API key", async (context) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  let request;
  context.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.TEXTBEE_API_KEY;
    else process.env.TEXTBEE_API_KEY = originalApiKey;
  });

  process.env.TEXTBEE_API_KEY = "test-api-key";
  global.fetch = async (url, options) => {
    request = { url, options };
    return { ok: true };
  };

  await sendSms("09171234567", "012345");
  assert.equal(request.url, "https://api.textbee.dev/api/v1/gateway/send-sms");
  assert.equal(request.options.headers["x-api-key"], "test-api-key");
  assert.deepEqual(JSON.parse(request.options.body), {
    recipients: ["+639171234567"],
    message: "[TaskPanda] Your verification code is 012345. Valid for 5 minutes.",
  });
});

test("logs and propagates TextBee delivery errors", async (context) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.TEXTBEE_API_KEY;
  const originalConsoleError = console.error;
  let logged = false;
  context.after(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
    if (originalApiKey === undefined) delete process.env.TEXTBEE_API_KEY;
    else process.env.TEXTBEE_API_KEY = originalApiKey;
  });

  process.env.TEXTBEE_API_KEY = "test-api-key";
  global.fetch = async () => ({ ok: false, status: 503 });
  console.error = () => { logged = true; };

  await assert.rejects(sendSms("09171234567", "012345"), /HTTP 503/);
  assert.equal(logged, true);
});
