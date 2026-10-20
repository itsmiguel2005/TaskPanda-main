const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizePublicText, toPublicProvider } = require("./providerController");

test("public provider discovery payloads exclude contact and identity verification data", () => {
  const publicProvider = toPublicProvider({
    _id: "provider-1",
    businessName: "Dagupan Home Repair",
    fullName: "Private Legal Name",
    username: "dagupan-repairs",
    bio: "Call +63 917 123 4567, 9171234567, or email service@example.com",
    email: "private@example.com",
    mobileNumber: "+639171234567",
    verificationDetails: { philsysIdNumber: "1234-5678-9012-3456", ocrConfidence: 99 },
    isVerified: true,
    verificationStatus: "verified",
    professions: ["Plumbing"],
    averageRating: 4.8,
    totalReviews: 12,
    distanceKm: 2.5,
    lastActive: "2026-10-20T14:00:00.000Z",
    isOnline: true,
    tesdaCertificates: [{ trade: "Plumbing", status: "approved", certificateUrl: "/private.pdf" }],
  });

  assert.deepEqual(Object.keys(publicProvider).sort(), [
    "_id",
    "averageRating",
    "bio",
    "city",
    "distanceKm",
    "fullName",
    "isOnline",
    "isVerified",
    "lastActive",
    "onTimeStreak",
    "profileImage",
    "professions",
    "province",
    "tesdaCertificates",
    "totalReviews",
    "username",
    "verificationStatus",
  ].sort());
  assert.equal(publicProvider.fullName, "Dagupan Home Repair");
  assert.equal(publicProvider.lastActive, "2026-10-20T14:00:00.000Z");
  assert.equal(publicProvider.isOnline, true);
  assert.deepEqual(publicProvider.tesdaCertificates, [{ trade: "Plumbing", status: "approved" }]);
  assert.equal(publicProvider.bio.includes("service@example.com"), false);
  assert.equal(publicProvider.bio.includes("+63 917 123 4567"), false);
  assert.equal(publicProvider.bio.includes("9171234567"), false);
  assert.equal(JSON.stringify(publicProvider).includes("private@example.com"), false);
  assert.equal(JSON.stringify(publicProvider).includes("1234-5678-9012-3456"), false);

  const providerWithoutShopName = toPublicProvider({
    _id: "provider-2",
    fullName: "Maria Santos",
    username: "maria.santos",
  });
  assert.equal(providerWithoutShopName.fullName, "Maria Santos");
  assert.equal(providerWithoutShopName.lastActive, null);
  assert.equal(providerWithoutShopName.isOnline, false);
});

test("public text masking leaves non-contact text intact", () => {
  assert.equal(sanitizePublicText("Available in Dagupan City for plumbing jobs."), "Available in Dagupan City for plumbing jobs.");
});
