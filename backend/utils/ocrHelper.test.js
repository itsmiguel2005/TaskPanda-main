const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OCR_LANGUAGES,
  OCR_ORIENTATION_LANGUAGE,
  OCR_SEGMENTATION_MODES,
  scoreNameMatch,
  selectBestOCRCandidate,
  shouldAutoVerify,
} = require("./ocrHelper");

test("OCR supports English and Filipino IDs using multiple card layout modes", () => {
  assert.equal(OCR_LANGUAGES, "eng+fil");
  assert.equal(OCR_ORIENTATION_LANGUAGE, "osd");
  assert.deepEqual(OCR_SEGMENTATION_MODES, [
    "1",
    "3",
    "6",
    "11",
  ]);
});

test("OCR name matching normalizes accents, case, and punctuation", () => {
  assert.deepEqual(scoreNameMatch("JOSE, MARIA! SANTOS.", "José María Santos"), {
    accuracy: 1,
    matchedParts: 3,
    totalParts: 3,
  });
});

test("OCR name matching does not treat approximate spellings as a verified identity", () => {
  assert.deepEqual(scoreNameMatch("MAR1A SANTOS", "Maria Beatriz Santos"), {
    accuracy: 1 / 3,
    matchedParts: 1,
    totalParts: 3,
  });
});

test("OCR name matching reports the matched profile-name fraction", () => {
  assert.deepEqual(scoreNameMatch("ANA CRUZ", "Ana Beatriz Maria Cruz"), {
    accuracy: 0.5,
    matchedParts: 2,
    totalParts: 4,
  });
});

test("a different or missing account-name part prevents a full match", () => {
  assert.deepEqual(scoreNameMatch("Nina Cruz", "Nina Nino Cruz"), {
    accuracy: 2 / 3,
    matchedParts: 2,
    totalParts: 3,
  });
});

test("automatic verification requires the full account name and at least two name parts", () => {
  assert.equal(shouldAutoVerify(60, 1, 2), true);
  assert.equal(shouldAutoVerify(100, 0.99, 3), false);
  assert.equal(shouldAutoVerify(59.99, 1, 2), false);
  assert.equal(shouldAutoVerify(100, 1, 1), false);
});

test("OCR selects a full account-name match over higher-confidence unrelated layout output", () => {
  const result = selectBestOCRCandidate([
    { confidence: 96, text: "MARIA SANTOS" },
    { confidence: 63, text: "ANA BEATRIZ CRUZ" },
  ], "Ana Beatriz Cruz");

  assert.equal(result.confidence, 63);
  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(shouldAutoVerify(result.confidence, result.nameMatch.accuracy, result.nameMatch.totalParts), true);
});

test("OCR name matching fails closed when either side has no usable name parts", () => {
  assert.deepEqual(scoreNameMatch("", "Maria Santos"), {
    accuracy: 0,
    matchedParts: 0,
    totalParts: 2,
  });
  assert.deepEqual(scoreNameMatch("Maria Santos", ""), {
    accuracy: 0,
    matchedParts: 0,
    totalParts: 0,
  });
});
