const { waitUntil } = require("@vercel/functions");
const mongoose = require("mongoose");
const PandaBotUsage = require("../models/PandaBotUsage");

function getTokenCount(value) {
  if (value === null || value === undefined || value === "") return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

async function recordPandaBotUsage({ model, success, usageMetadata, latencyMs }) {
  const now = new Date();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const inputTokens = getTokenCount(usageMetadata?.promptTokenCount);
  const outputTokens = getTokenCount(usageMetadata?.candidatesTokenCount);
  const reportedTotalTokens = getTokenCount(usageMetadata?.totalTokenCount);
  const hasTokenUsage = inputTokens !== null || outputTokens !== null || reportedTotalTokens !== null;
  const safeInputTokens = inputTokens || 0;
  const safeOutputTokens = outputTokens || 0;
  const totalTokens = reportedTotalTokens ?? safeInputTokens + safeOutputTokens;
  const increments = {
    requestCount: 1,
    successCount: success ? 1 : 0,
    errorCount: success ? 0 : 1,
    tokenUsageRequests: hasTokenUsage ? 1 : 0,
    inputTokens: safeInputTokens,
    outputTokens: safeOutputTokens,
    totalTokens,
    totalLatencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
  };
  const maxima = { lastRequestAt: now };
  if (success) maxima.lastSuccessAt = now;
  else maxima.lastErrorAt = now;

  await PandaBotUsage.updateOne(
    { day, model: String(model || "unavailable").slice(0, 100) },
    {
      $setOnInsert: { day, model: String(model || "unavailable").slice(0, 100) },
      $inc: increments,
      $max: maxima,
    },
    { upsert: true },
  );
}

function schedulePandaBotUsageRecord(record) {
  const write = Promise.resolve()
    .then(() => recordPandaBotUsage(record))
    .catch((error) => {
      console.error("Could not persist PandaBot usage metrics:", error);
    });
  waitUntil(write);
}

async function getPandaBotHealth(configured) {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29));
  const dailyMetrics = await PandaBotUsage.find({ day: mongoose.trusted({ $gte: since }) })
    .sort({ lastRequestAt: -1 })
    .lean();
  const totals = dailyMetrics.reduce((summary, metric) => ({
    requests: summary.requests + metric.requestCount,
    successes: summary.successes + metric.successCount,
    errors: summary.errors + metric.errorCount,
    tokenUsageRequests: summary.tokenUsageRequests + metric.tokenUsageRequests,
    inputTokens: summary.inputTokens + metric.inputTokens,
    outputTokens: summary.outputTokens + metric.outputTokens,
    totalTokens: summary.totalTokens + metric.totalTokens,
    totalLatencyMs: summary.totalLatencyMs + metric.totalLatencyMs,
    lastRequestAt: !summary.lastRequestAt || metric.lastRequestAt > summary.lastRequestAt
      ? metric.lastRequestAt
      : summary.lastRequestAt,
    lastSuccessAt: metric.lastSuccessAt && (!summary.lastSuccessAt || metric.lastSuccessAt > summary.lastSuccessAt)
      ? metric.lastSuccessAt
      : summary.lastSuccessAt,
    lastErrorAt: metric.lastErrorAt && (!summary.lastErrorAt || metric.lastErrorAt > summary.lastErrorAt)
      ? metric.lastErrorAt
      : summary.lastErrorAt,
  }), {
    requests: 0,
    successes: 0,
    errors: 0,
    tokenUsageRequests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    totalLatencyMs: 0,
    lastRequestAt: null,
    lastSuccessAt: null,
    lastErrorAt: null,
  });
  const latestMetric = dailyMetrics[0];
  const status = !configured
    ? "not_configured"
    : !totals.requests
    ? "not_tested"
    : totals.lastErrorAt && (!totals.lastSuccessAt || totals.lastErrorAt >= totals.lastSuccessAt)
    ? "degraded"
    : "operational";

  return {
    status,
    model: latestMetric?.model === "unavailable" ? null : latestMetric?.model || null,
    windowDays: 30,
    requests: totals.requests,
    successes: totals.successes,
    errors: totals.errors,
    errorRate: totals.requests ? Math.round((totals.errors / totals.requests) * 100) : 0,
    tokenUsageRequests: totals.tokenUsageRequests,
    inputTokens: totals.inputTokens,
    outputTokens: totals.outputTokens,
    totalTokens: totals.totalTokens,
    averageLatencyMs: totals.requests ? Math.round(totals.totalLatencyMs / totals.requests) : null,
    lastRequestAt: totals.lastRequestAt,
    lastSuccessAt: totals.lastSuccessAt,
    lastErrorAt: totals.lastErrorAt,
    checkedAt: now,
  };
}

module.exports = { getPandaBotHealth, schedulePandaBotUsageRecord };
