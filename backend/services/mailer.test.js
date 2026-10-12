const test = require("node:test");
const assert = require("node:assert/strict");
const { sendVerificationMailWithRetry } = require("./mailer");

test("verification mail retries a transient SMTP failure once", async () => {
  let attempts = 0;
  const result = await sendVerificationMailWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("Temporary connection failure");
      error.code = "ECONNECTION";
      throw error;
    }
    return { accepted: ["user@example.com"] };
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result.accepted, ["user@example.com"]);
});

test("verification mail does not retry a permanent SMTP error", async () => {
  let attempts = 0;
  await assert.rejects(
    sendVerificationMailWithRetry(async () => {
      attempts += 1;
      const error = new Error("Authentication failed");
      error.code = "EAUTH";
      throw error;
    }),
    /Authentication failed/,
  );
  assert.equal(attempts, 1);
});

test("verification mail retries a temporary SMTP response once", async () => {
  let attempts = 0;
  await sendVerificationMailWithRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("Temporary SMTP response");
      error.responseCode = 451;
      throw error;
    }
    return { accepted: ["user@example.com"] };
  });
  assert.equal(attempts, 2);
});
