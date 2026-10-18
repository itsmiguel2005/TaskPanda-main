const test = require("node:test");
const assert = require("node:assert/strict");
const sharp = require("sharp");
const {
  OCR_ROTATIONS,
  OCR_SEGMENTATION_MODES,
  calculateVerificationScore,
  createIdOCRVariants,
  detectCardBounds,
  evaluateOCRCandidate,
  extractIdentifier,
  hasPhilSysHeader,
  isPhysicalCardLayout,
  normalizeText,
  parseDateOfBirth,
  resolveIdentifier,
  selectOCRConfidence,
  shouldUseManualReview,
} = require("./ocrHelper");

const basePhilSysCard = [
  "PAMBANSANG PAGKAKAKILANLAN",
  "PSN: 1234-5678-9012",
  "APELYIDO: Santos",
  "MGA PANGALAN: Mika Luz",
  "GITNANG APELYIDO: Reyes",
  "PETSA NG KAPANGANAKAN: OKTUBRE 5, 2005",
].join("\n");

test("OCR is limited to PhilSys anchors and four universal orientations", () => {
  assert.deepEqual(OCR_ROTATIONS, [0, 90, 180, 270]);
  assert.deepEqual(OCR_SEGMENTATION_MODES, ["4", "6", "7", "8"]);
  assert.equal(hasPhilSysHeader(basePhilSysCard), true);
  assert.equal(hasPhilSysHeader("UNSUPPORTED DOCUMENT REPUBLIC OF THE PHILIPPINES"), false);
});

test("image preprocessing finds and crops a card against a dark photo background", async () => {
  const width = 400;
  const height = 250;
  const pixels = Buffer.alloc(width * height, 25);
  for (let y = 30; y < 220; y += 1) {
    pixels.fill(220, y * width + 40, y * width + 360);
  }

  const bounds = detectCardBounds(pixels, width, height);
  assert.ok(bounds);
  assert.ok(bounds.left < 40);
  assert.ok(bounds.top < 30);
  assert.ok(bounds.left + bounds.width > 360);
  assert.ok(bounds.top + bounds.height > 220);
  assert.ok(bounds.width < width);

  const image = await sharp(pixels, {
    raw: { width, height, channels: 1 },
  }).png().toBuffer();
  const variants = await createIdOCRVariants(image);
  assert.equal(variants.length, OCR_ROTATIONS.length);
  assert.ok(variants.some((variant) => variant.width / variant.height > 1.3));
  const processed = await sharp(variants[0].enhanced)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const colorMetadata = await sharp(variants[0].color).metadata();
  assert.equal(processed.info.channels, 1);
  assert.ok(processed.data[
    Math.floor(processed.info.height / 2) * processed.info.width +
    Math.floor(processed.info.width / 2)
  ] > 200);
  assert.equal(colorMetadata.width, variants[0].width);
  assert.equal(colorMetadata.height, variants[0].height);
});

test("card layout distinguishes inline digital fields from stacked physical fields", () => {
  assert.equal(isPhysicalCardLayout([
    { text: "APELYIDO/LAST NAME CALIMLIM" },
    { text: "MGA PANGALAN/GIVEN NAMES MIGUEL EDUARDO" },
  ]), false);
  assert.equal(isPhysicalCardLayout([
    { text: "Apelyido/Last Name" },
    { text: "CALIMLIM" },
    { text: "Mga Pangalan/Given Names" },
    { text: "MIGUEL EDUARDO" },
  ], 1.61), true);
  assert.equal(isPhysicalCardLayout([
    { text: "Gitnang Apelyido/Midd/e Name" },
  ], 1.61), true);
  assert.equal(isPhysicalCardLayout([], 1.76), false);
});

test("name normalization ignores case, extra spaces, and diacritics", () => {
  assert.equal(normalizeText("  JOSÉ   María "), "jose maria");
});

test("identifier extraction accepts 12-digit PSNs and 16-digit PCNs", () => {
  assert.deepEqual(extractIdentifier("PSN 1234-5678-9012"), {
    digits: "123456789012",
    type: "PSN",
    labeled: true,
  });
  assert.deepEqual(extractIdentifier("PCN: 1234-5678-9012-3456"), {
    digits: "1234567890123456",
    type: "PCN",
    labeled: true,
  });
  assert.equal(extractIdentifier("PSN5285-3761-9548-6750").digits, "5285376195486750");
  assert.equal(extractIdentifier("5285-3761-9548l6750").digits, "5285376195486750");
});

test("targeted PCN reads outvote one conflicting full-card OCR read", () => {
  const expected = { digits: "5285376195486750", type: "PCN", labeled: false };
  const noisyFullCardRead = { digits: "5285376195484750", type: "PCN", labeled: true };
  assert.deepEqual(resolveIdentifier(noisyFullCardRead, [expected, expected]), expected);
});

test("ambiguous PCN readings are not silently stored as a guessed identifier", () => {
  const expected = { digits: "5285376195486750", type: "PCN", labeled: false };
  const conflictingRead = { digits: "5285376195484750", type: "PCN", labeled: false };
  assert.equal(resolveIdentifier(conflictingRead, [expected]), null);
  assert.equal(resolveIdentifier(expected, [expected, conflictingRead]), null);
  assert.equal(resolveIdentifier(null, [expected]), null);
});

test("OCR confidence prefers a stronger scan of the selected PCN over unrelated crop reads", () => {
  const selected = { digits: "5285376195486750", type: "PCN", labeled: false };
  const readings = [
    { identifier: selected, confidence: 64 },
    { identifier: { ...selected, digits: "5285376195484750" }, confidence: 98 },
  ];
  assert.equal(selectOCRConfidence(42, readings, selected), 64);
  assert.equal(selectOCRConfidence(72, readings, selected), 72);
  assert.equal(selectOCRConfidence(42, readings, null), 42);
});

test("field rescans retain the PCN selected by targeted scan consensus", () => {
  const selected = { digits: "5285376195486750", type: "PCN", labeled: false };
  const rescanned = evaluateOCRCandidate({
    confidence: 92,
    text: basePhilSysCard.replace("6750", "4750"),
    identifier: selected,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    role: "client",
  });
  assert.equal(rescanned.identifier.digits.slice(-4), "6750");
});

test("number parsing corrects common OCR confusions under numeric labels", () => {
  assert.equal(extractIdentifier("PSN 12O4-567B-9012").digits, "120456789012");
  assert.equal(parseDateOfBirth("1O/5/2O05"), "2005-10-05");
});

test("birth dates parse English and Tagalog month names with their anchor", () => {
  assert.equal(parseDateOfBirth("OCTOBER 5, 2005"), "2005-10-05");
  assert.equal(parseDateOfBirth("OCTOBER'5, 2005"), "2005-10-05");
  assert.equal(parseDateOfBirth("5 OKTUBRE 2005"), "2005-10-05");
  assert.equal(parseDateOfBirth("FEBRUARY 31, 2005"), null);
});

test("bilingual PhilSys field labels are not included in extracted names", () => {
  const result = evaluateOCRCandidate({
    confidence: 96,
    text: [
      "PAMBANSANG PAGKAKAKILANLAN",
      "PCN: 1234-5678-9012-3456",
      "APELYIDO / LAST NAME",
      "Santos",
      "MGA PANGALAN / GIVEN NAMES",
      "Mika Luz",
      "GITNANG APELYIDO / MIDOLE NAME",
      "Reyes",
    ].join("\n"),
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    role: "client",
  });
  assert.equal(result.fields.lastName, "Santos");
  assert.equal(result.fields.firstName, "Mika Luz");
  assert.equal(result.fields.middleName, "Reyes");
  assert.equal(result.nameMatchAccuracy, 100);
});

test("exact PhilSys name and DOB matches qualify only at high OCR confidence", () => {
  const result = evaluateOCRCandidate({
    confidence: 96,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2005-10-05",
    role: "client",
  });
  assert.equal(result.ocrConfidence, 96);
  assert.equal(result.identityValid, true);
  assert.equal(result.firstNameMatched, true);
  assert.equal(result.lastNameMatched, true);
  assert.equal(result.dateOfBirthMatched, true);
  assert.equal(result.autoVerified, true);
});

test("clients do not require an account DOB match for identity verification", () => {
  const result = evaluateOCRCandidate({
    confidence: 96,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    role: "client",
  });
  assert.equal(result.dateOfBirthMatched, false);
  assert.equal(result.autoVerified, true);
  assert.equal(shouldUseManualReview(result), false);
});

test("full-name matching works when account name parts differ from PhilSys field boundaries", () => {
  const result = evaluateOCRCandidate({
    confidence: 96,
    text: basePhilSysCard,
  }, {
    firstName: "Mika",
    middleName: "Luz Reyes",
    lastName: "Santos",
    fullName: "Mika Luz Reyes Santos",
    dateOfBirth: "2005-10-05",
    role: "client",
  });
  assert.equal(result.nameMatchAccuracy, 100);
  assert.equal(result.autoVerified, true);
});

test("client verification score normalizes the PCN and name weights without DOB", () => {
  const result = evaluateOCRCandidate({
    confidence: 42,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    role: "client",
  });
  assert.equal(result.ocrConfidence, 42);
  assert.equal(result.verificationScore, 100);
  assert.equal(result.autoVerified, true);
});

test("provider verification score includes DOB match and adult eligibility", () => {
  const validProvider = evaluateOCRCandidate({
    confidence: 42,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2005-10-05",
    role: "provider",
  });
  assert.equal(validProvider.verificationScore, 100);
  assert.equal(validProvider.autoVerified, true);

  const missingDob = evaluateOCRCandidate({
    confidence: 99,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    role: "provider",
  });
  assert.equal(missingDob.verificationScore, 80);
  assert.equal(missingDob.autoVerified, false);
  assert.equal(shouldUseManualReview(missingDob), true);
});

test("verification score uses valid identifier format, fuzzy name, and applicable weights", () => {
  assert.equal(calculateVerificationScore({
    identifier: { digits: "1234567890123456" },
    nameMatchAccuracy: 80,
    role: "client",
  }), 93);
  assert.equal(calculateVerificationScore({
    identifier: { digits: "123456789012" },
    nameMatchAccuracy: 80,
    parsedDateOfBirth: "2000-01-01",
    dateOfBirthMatched: true,
    providerAge: 26,
    role: "provider",
  }), 94);
  assert.equal(calculateVerificationScore({
    identifier: { digits: "12345678" },
    nameMatchAccuracy: 100,
    role: "client",
  }), 38);
});

test("low Tesseract confidence does not block a high-scoring matching identity", () => {
  const result = evaluateOCRCandidate({
    confidence: 75,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2005-10-05",
    role: "client",
  });
  assert.equal(result.ocrConfidence, 75);
  assert.equal(result.verificationScore, 100);
  assert.equal(result.identityValid, true);
  assert.equal(result.autoVerified, true);
  assert.equal(shouldUseManualReview(result), false);
});

test("provider age eligibility is checked against the PhilSys birth date", () => {
  const adult = evaluateOCRCandidate({
    confidence: 97,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2005-10-05",
    role: "provider",
  });
  assert.equal(adult.providerAgeEligible, true);
  assert.equal(adult.autoVerified, true);

  const mismatch = evaluateOCRCandidate({
    confidence: 97,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2004-10-05",
    role: "provider",
  });
  assert.equal(mismatch.dateOfBirthMatched, false);
  assert.equal(mismatch.autoVerified, false);
  assert.equal(shouldUseManualReview(mismatch), true);
});

test("provider DOB that cannot be matched stays in manual review", () => {
  const result = evaluateOCRCandidate({
    confidence: 97,
    text: basePhilSysCard,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    role: "provider",
  });
  assert.equal(result.providerAgeEligible, true);
  assert.equal(result.dateOfBirthMatched, false);
  assert.equal(result.autoVerified, false);
  assert.equal(shouldUseManualReview(result), true);
});

test("provider younger than 18 is not eligible for automatic verification", () => {
  const underageBirthYear = new Date().getUTCFullYear() - 17;
  const card = basePhilSysCard.replace("2005", String(underageBirthYear));
  const result = evaluateOCRCandidate({
    confidence: 99,
    text: card,
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: `${underageBirthYear}-10-05`,
    role: "provider",
  });
  assert.equal(result.providerAge < 18, true);
  assert.equal(result.providerAgeEligible, false);
  assert.equal(result.autoVerified, false);
});

test("a borderline fuzzy name stays in review even when the weighted score exceeds 85", () => {
  const result = evaluateOCRCandidate({
    confidence: 94,
    text: basePhilSysCard.replace("Mika Luz", "Mika"),
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2005-10-05",
    role: "client",
  });
  assert.equal(result.nameMatchAccuracy, 75);
  assert.equal(result.firstNameMatched, false);
  assert.equal(result.verificationScore, 91);
  assert.equal(result.autoVerified, false);
  assert.equal(shouldUseManualReview(result), true);
});

test("a non-PhilSys document never qualifies for manual identity review", () => {
  const result = evaluateOCRCandidate({
    confidence: 99,
    text: "UNSUPPORTED DOCUMENT\nPSN 1234-5678-9012\nSURNAME: SANTOS",
  }, {
    firstName: "Mika Luz",
    lastName: "Santos",
    dateOfBirth: "2005-10-05",
    role: "client",
  });
  assert.equal(result.identityValid, false);
  assert.equal(shouldUseManualReview(result), false);
});
