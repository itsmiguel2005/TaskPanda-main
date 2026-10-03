const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateProviderStreak } = require("./providerStreak");

const now = new Date("2026-10-03T12:00:00.000Z");

function completed(serviceDate, completedAt, timeSlot = "9:00 AM") {
  return {
    serviceDate: new Date(`${serviceDate}T00:00:00.000Z`),
    timeSlot,
    status: "complete",
    workCompletedAt: new Date(completedAt),
  };
}

test("counts consecutive on-time bookings across days with no scheduled work", () => {
  const streak = calculateProviderStreak([
    completed("2026-09-20", "2026-09-20T12:00:00.000Z"),
    completed("2026-10-01", "2026-10-01T12:00:00.000Z"),
    completed("2026-10-03", "2026-10-03T12:00:00.000Z"),
  ], now);

  assert.deepEqual(streak, { count: 3, milestone: null, nextMilestone: 5 });
});

test("counts achieved milestones using on-time completed bookings only", () => {
  const bookings = Array.from({ length: 5 }, (_, index) => {
    const day = String(index + 20).padStart(2, "0");
    return completed(`2026-09-${day}`, `2026-09-${day}T12:00:00.000Z`);
  });

  assert.deepEqual(calculateProviderStreak(bookings, now), {
    count: 5,
    milestone: 5,
    nextMilestone: 10,
  });
});

test("a late completion resets the sequence; later on-time work starts a new streak", () => {
  const streak = calculateProviderStreak([
    completed("2026-09-30", "2026-09-30T12:00:00.000Z"),
    completed("2026-10-01", "2026-10-02T01:00:00.000Z"),
    completed("2026-10-03", "2026-10-03T12:00:00.000Z"),
  ], now);

  assert.deepEqual(streak, { count: 1, milestone: null, nextMilestone: 5 });
});

test("an overdue incomplete scheduled booking breaks the streak", () => {
  const streak = calculateProviderStreak([
    completed("2026-10-01", "2026-10-01T12:00:00.000Z"),
    {
      serviceDate: new Date("2026-10-02T00:00:00.000Z"),
      timeSlot: "1:30 PM",
      status: "in_progress",
    },
    completed("2026-10-03", "2026-10-03T12:00:00.000Z"),
  ], now);

  assert.deepEqual(streak, { count: 1, milestone: null, nextMilestone: 5 });
});

test("future jobs and unresolved bookings later today do not break an earned streak", () => {
  const streak = calculateProviderStreak([
    completed("2026-10-01", "2026-10-01T12:00:00.000Z"),
    completed("2026-10-03", "2026-10-03T11:00:00.000Z"),
    {
      serviceDate: new Date("2026-10-03T00:00:00.000Z"),
      timeSlot: "6:00 PM",
      status: "approved",
    },
    {
      serviceDate: new Date("2026-10-04T00:00:00.000Z"),
      timeSlot: "9:00 AM",
      status: "approved",
    },
  ], now);

  assert.deepEqual(streak, { count: 2, milestone: null, nextMilestone: 5 });
});

test("earned milestone tracks the latest threshold and the next one", () => {
  const bookings = Array.from({ length: 25 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8, 1 + index));
    const dateKey = date.toISOString().slice(0, 10);
    return completed(dateKey, `${dateKey}T12:00:00.000Z`);
  });

  assert.deepEqual(calculateProviderStreak(bookings, now), {
    count: 25,
    milestone: 25,
    nextMilestone: 50,
  });
});
