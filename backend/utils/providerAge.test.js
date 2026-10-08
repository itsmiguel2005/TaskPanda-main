const test = require("node:test");
const assert = require("node:assert/strict");
const { getAgeFromDateOfBirth } = require("./providerAge");

const today = new Date("2026-10-08T12:00:00.000Z");

test("provider date of birth must be within the allowed age range", () => {
  assert.equal(getAgeFromDateOfBirth("2008-10-08", today), 18);
  assert.equal(getAgeFromDateOfBirth("1905-10-09", today), 120);
  assert.equal(getAgeFromDateOfBirth("1905-10-08", today), 121);
  assert.equal(getAgeFromDateOfBirth("2008-10-09", today), 17);
  assert.equal(getAgeFromDateOfBirth("1906-10-07", today), 120);
  assert.equal(getAgeFromDateOfBirth("0005-02-01", today), 2021);
});

test("provider date of birth rejects impossible calendar dates and formats", () => {
  assert.equal(getAgeFromDateOfBirth("2025-02-29", today), null);
  assert.equal(getAgeFromDateOfBirth("2026-13-01", today), null);
  assert.equal(getAgeFromDateOfBirth("05-02-01", today), null);
});
