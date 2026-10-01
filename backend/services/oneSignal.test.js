const assert = require("node:assert/strict");
const test = require("node:test");
const config = require("../config/env");
const { buildPushPayload, buildRoleFilters } = require("./oneSignal");

test("OneSignal push payload targets a MongoDB user external ID and preserves a deep link", () => {
  const appUrl = config.appUrl || "http://localhost:5173";
  const payload = buildPushPayload({
    userIds: ["user-123"],
    title: "New booking request",
    body: "A client sent you a request.",
    url: "/provider-bookings?bookingId=booking-123",
    data: { bookingId: "booking-123", event: "booking.created" },
  });

  assert.equal(payload.target_channel, "push");
  assert.deepEqual(payload.include_aliases, { external_id: ["user-123"] });
  assert.equal(payload.url, new URL("/provider-bookings?bookingId=booking-123", `${appUrl.replace(/\/+$/, "")}/`).toString());
  assert.equal(payload.data.bookingId, "booking-123");
  assert.equal(payload.filters, undefined);
});

test("OneSignal role targeting creates OR filters from role tags", () => {
  assert.deepEqual(buildRoleFilters(["client", "provider"]), [
    { field: "tag", key: "role", relation: "=", value: "client" },
    { operator: "OR" },
    { field: "tag", key: "role", relation: "=", value: "provider" },
  ]);
});

test("OneSignal push payload requires one target strategy", () => {
  assert.throws(() => buildPushPayload({ title: "Alert", body: "Update" }), /exactly one/);
  assert.throws(() => buildPushPayload({ userIds: ["user-1"], roles: ["client"], title: "Alert", body: "Update" }), /exactly one/);
  assert.throws(() => buildRoleFilters(["owner"]), /supported OneSignal role/);
});

