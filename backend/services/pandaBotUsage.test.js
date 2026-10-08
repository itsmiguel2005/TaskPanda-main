const assert = require("node:assert/strict");
const test = require("node:test");
const PandaBotUsage = require("../models/PandaBotUsage");
const { getPandaBotHealth } = require("./pandaBotUsage");

const originalFind = PandaBotUsage.find;

function stubMetrics(metrics) {
  PandaBotUsage.find = () => ({
    sort: () => ({ lean: async () => metrics }),
  });
}

test.afterEach(() => {
  PandaBotUsage.find = originalFind;
});

test("summarizes reported usage and reflects the latest Gemini outcome", async () => {
  const now = new Date();
  const previousError = new Date(now.getTime() - 1000);
  stubMetrics([
    {
      model: "gemini-3.5-flash-lite",
      requestCount: 3,
      successCount: 3,
      errorCount: 0,
      tokenUsageRequests: 2,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      totalLatencyMs: 3000,
      lastRequestAt: now,
      lastSuccessAt: now,
      lastErrorAt: null,
    },
    {
      model: "gemini-2.5-flash",
      requestCount: 1,
      successCount: 0,
      errorCount: 1,
      tokenUsageRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalLatencyMs: 1500,
      lastRequestAt: previousError,
      lastSuccessAt: null,
      lastErrorAt: previousError,
    },
  ]);

  const health = await getPandaBotHealth(true);

  assert.equal(health.status, "operational");
  assert.equal(health.model, "gemini-3.5-flash-lite");
  assert.equal(health.requests, 4);
  assert.equal(health.errors, 1);
  assert.equal(health.errorRate, 25);
  assert.equal(health.totalTokens, 150);
  assert.equal(health.tokenUsageRequests, 2);
  assert.equal(health.averageLatencyMs, 1125);
});

test("reports degraded, untested, and unconfigured states accurately", async (t) => {
  await t.test("a newer failure marks the service degraded", async () => {
    const now = new Date();
    stubMetrics([{
      model: "gemini-3.5-flash-lite",
      requestCount: 1,
      successCount: 0,
      errorCount: 1,
      tokenUsageRequests: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      totalLatencyMs: 800,
      lastRequestAt: now,
      lastSuccessAt: null,
      lastErrorAt: now,
    }]);

    assert.equal((await getPandaBotHealth(true)).status, "degraded");
  });

  await t.test("no request history is not tested, or not configured without a key", async () => {
    stubMetrics([]);

    assert.equal((await getPandaBotHealth(true)).status, "not_tested");
    assert.equal((await getPandaBotHealth(false)).status, "not_configured");
  });
});
