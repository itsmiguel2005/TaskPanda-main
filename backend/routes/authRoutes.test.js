const test = require("node:test");
const assert = require("node:assert/strict");
const router = require("./authRoutes");

const registrationRoute = router.stack.find((layer) => layer.route?.path === "/register");
const validationMiddleware = registrationRoute.route.stack
  .slice(1, registrationRoute.route.stack.findIndex((layer) => layer.name === "verifyRecaptcha"))
  .map((layer) => layer.handle);

async function validateRegistration(body) {
  const req = { body, params: {}, query: {}, headers: {} };
  let finishMiddleware;
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      finishMiddleware?.();
      return this;
    },
  };

  for (const middleware of validationMiddleware) {
    await new Promise((resolve, reject) => {
      finishMiddleware = resolve;
      try {
        const result = middleware(req, res, (error) => error ? reject(error) : resolve());
        if (result && typeof result.then === "function") result.catch(reject);
      } catch (error) {
        reject(error);
      }
    });
    if (res.statusCode !== 200) break;
  }

  return res;
}

const validProviderRegistration = {
  role: "provider",
  registrationPhase: "start",
  email: "provider@example.com",
  username: "provider1",
  password: "Provider123!",
};

test("provider email-registration step does not require professions yet", async () => {
  const response = await validateRegistration({ ...validProviderRegistration });

  assert.equal(response.statusCode, 200);
  assert.equal(response.payload, undefined);
});

test("provider email-registration step validates professions when they are supplied", async () => {
  const response = await validateRegistration({
    ...validProviderRegistration,
    professions: [],
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.payload.message, "Choose between 1 and 3 professions or trades.");
});
