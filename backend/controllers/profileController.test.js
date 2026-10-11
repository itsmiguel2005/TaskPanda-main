const test = require("node:test");
const assert = require("node:assert/strict");
const { handleUpdateDashboardPreferences } = require("./profileController");

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
