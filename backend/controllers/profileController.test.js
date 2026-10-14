const test = require("node:test");
const assert = require("node:assert/strict");
const { handleUpdateDashboardPreferences, handleUpdateProviderPreferences, handleUpdateProviderAvailability } = require("./profileController");

test("dashboard density preference is saved and returned from the profile API handler", async () => {
  let saveCount = 0;
  const req = {
    body: { dashboardDensityPreference: "compact" },
    user: {
      _id: "user-id",
      role: "client",
      dashboardDensityPreference: "comfortable",
      save: async function save() {
        saveCount += 1;
      },
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await handleUpdateDashboardPreferences(req, res);

  assert.equal(saveCount, 1);
  assert.equal(req.user.dashboardDensityPreference, "compact");
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.dashboardDensityPreference, "compact");
});

test("provider incoming request density preference is saved independently", async () => {
  let saveCount = 0;
  const req = {
    body: { providerIncomingRequestsDensityPreference: "compact" },
    user: {
      _id: "provider-id",
      role: "provider",
      providerIncomingRequestsDensityPreference: "comfortable",
      providerJobsDensityPreference: "comfortable",
      save: async function save() {
        saveCount += 1;
      },
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await handleUpdateProviderPreferences(req, res);

  assert.equal(saveCount, 1);
  assert.equal(req.user.providerIncomingRequestsDensityPreference, "compact");
  assert.equal(req.user.providerJobsDensityPreference, "comfortable");
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.providerIncomingRequestsDensityPreference, "compact");
  assert.equal(res.payload.user.providerJobsDensityPreference, "comfortable");
});

test("provider jobs density preference is saved independently", async () => {
  const req = {
    body: { providerJobsDensityPreference: "compact" },
    user: {
      _id: "provider-id",
      role: "provider",
      providerIncomingRequestsDensityPreference: "comfortable",
      providerJobsDensityPreference: "comfortable",
      save: async function save() {},
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await handleUpdateProviderPreferences(req, res);

  assert.equal(req.user.providerIncomingRequestsDensityPreference, "comfortable");
  assert.equal(req.user.providerJobsDensityPreference, "compact");
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.user.providerJobsDensityPreference, "compact");
});

test("provider availability is saved and returned", async () => {
  let saveCount = 0;
  const req = {
    body: { isAvailable: false },
    user: {
      _id: "provider-id",
      role: "provider",
      isAvailable: true,
      save: async function save() {
        saveCount += 1;
      },
    },
  };
  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };

  await handleUpdateProviderAvailability(req, res);

  assert.equal(saveCount, 1);
  assert.equal(req.user.isAvailable, false);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { isAvailable: false });
});

test("availability updates reject non-provider users and non-boolean values", async () => {
  const makeResponse = () => ({
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  });
  const clientResponse = makeResponse();
  await handleUpdateProviderAvailability({
    body: { isAvailable: false },
    user: { role: "client", save: async () => assert.fail("Client availability must not be saved.") },
  }, clientResponse);
  assert.equal(clientResponse.statusCode, 403);

  const invalidValueResponse = makeResponse();
  await handleUpdateProviderAvailability({
    body: { isAvailable: "false" },
    user: { role: "provider", save: async () => assert.fail("Invalid availability must not be saved.") },
  }, invalidValueResponse);
  assert.equal(invalidValueResponse.statusCode, 400);
});
