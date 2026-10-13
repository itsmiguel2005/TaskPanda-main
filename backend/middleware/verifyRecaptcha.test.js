const test = require("node:test");
const assert = require("node:assert/strict");
const { createRecaptchaVerifier } = require("./verifyRecaptcha");

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

async function runMiddleware(middleware, req) {
  const res = createResponse();
  let nextCalled = false;
  await middleware(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

test("rejects requests without a token", async () => {
  const middleware = createRecaptchaVerifier({
    secretKey: "test-secret",
    fetchImpl: async () => {
      throw new Error("unexpected verification request");
    },
    expectedAction: "forgot_password",
  });

  const { res, nextCalled } = await runMiddleware(middleware, { body: {} });
  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, {
    success: false,
    message: "Security verification failed. Automated behavior detected.",
  });
  assert.equal(nextCalled, false);
});

test("posts the secret and token to Google and accepts an adequate score/action", async () => {
  let request;
  const middleware = createRecaptchaVerifier({
    secretKey: "test-secret",
    expectedAction: "verify_phone_otp",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return {
        ok: true,
        json: async () => ({ success: true, score: 0.5, action: "verify_phone_otp" }),
      };
    },
  });

  const { res, nextCalled } = await runMiddleware(middleware, {
    body: { recaptchaToken: "fresh-token" },
  });
  assert.equal(request.url, "https://www.google.com/recaptcha/api/siteverify");
  assert.equal(request.options.method, "POST");
  assert.equal(request.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.equal(request.options.body.toString(), "secret=test-secret&response=fresh-token");
  assert.equal(res.statusCode, null);
  assert.equal(nextCalled, true);
});

test("rejects failed, low-score, and wrong-action Google responses", async (t) => {
  const cases = [
    { success: false, score: 0.9, action: "forgot_password" },
    { success: true, score: 0.49, action: "forgot_password" },
    { success: true, score: 0.9, action: "other_action" },
  ];

  for (const verification of cases) {
    await t.test(JSON.stringify(verification), async () => {
      const middleware = createRecaptchaVerifier({
        secretKey: "test-secret",
        expectedAction: "forgot_password",
        fetchImpl: async () => ({ ok: true, json: async () => verification }),
      });

      const { res, nextCalled } = await runMiddleware(middleware, {
        body: { recaptchaToken: "fresh-token" },
      });
      assert.equal(res.statusCode, 403);
      assert.equal(nextCalled, false);
    });
  }
});

test("fails closed when Google verification is unavailable", async () => {
  const middleware = createRecaptchaVerifier({
    secretKey: "test-secret",
    expectedAction: "forgot_password",
    fetchImpl: async () => {
      throw new Error("upstream unavailable");
    },
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    const { res, nextCalled } = await runMiddleware(middleware, {
      body: { recaptchaToken: "fresh-token" },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.success, false);
    assert.equal(nextCalled, false);
  } finally {
    console.error = originalConsoleError;
  }
});
