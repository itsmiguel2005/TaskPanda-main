const test = require("node:test");
const assert = require("node:assert/strict");
const {
  OCR_LANGUAGES,
  OCR_ORIENTATION_LANGUAGE,
  OCR_SEGMENTATION_MODES,
  areIdSidesLikelySwapped,
  classifyIdSide,
  detectIdType,
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
    firstNameMatched: true,
    lastNameMatched: true,
  });
});

test("OCR name matching ignores short prepositions", () => {
  assert.deepEqual(scoreNameMatch("JOSE MARIA SANTOS", "José de la María Santos"), {
    accuracy: 1,
    matchedParts: 3,
    totalParts: 3,
    firstNameMatched: true,
    lastNameMatched: true,
  });
});

test("OCR name matching does not treat approximate spellings as a verified identity", () => {
  assert.deepEqual(scoreNameMatch("MAR1A SANTOS", "Maria Beatriz Santos"), {
    accuracy: 0.375,
    matchedParts: 1,
    totalParts: 3,
    firstNameMatched: false,
    lastNameMatched: true,
  });
});

test("first and last name matches meet the threshold when middle names are absent", () => {
  assert.deepEqual(scoreNameMatch("ANA CRUZ", "Ana Beatriz Maria Cruz"), {
    accuracy: 0.75,
    matchedParts: 2,
    totalParts: 4,
    firstNameMatched: true,
    lastNameMatched: true,
  });
  assert.equal(shouldAutoVerify(60, scoreNameMatch("ANA CRUZ", "Ana Beatriz Maria Cruz")), true);
});

test("matching the middle name increases the weighted score", () => {
  assert.equal(scoreNameMatch("ANA MARIA CRUZ", "Ana Maria Cruz").accuracy, 1);
});

test("a missing first or last name prevents auto-verification", () => {
  assert.deepEqual(scoreNameMatch("Nina Nino", "Nina Nino Cruz"), {
    accuracy: 0.625,
    matchedParts: 2,
    totalParts: 3,
    firstNameMatched: true,
    lastNameMatched: false,
  });
  assert.equal(shouldAutoVerify(100, scoreNameMatch("Nina Nino", "Nina Nino Cruz")), false);
});

test("two-part names require both first and last names to match", () => {
  assert.equal(shouldAutoVerify(60, scoreNameMatch("ANA CRUZ", "Ana Cruz")), true);
  assert.equal(shouldAutoVerify(100, scoreNameMatch("ANA", "Ana Cruz")), false);
});

test("automatic verification retains the OCR confidence floor and requires two name parts", () => {
  assert.equal(shouldAutoVerify(59.99, scoreNameMatch("Ana Cruz", "Ana Cruz")), false);
  assert.equal(shouldAutoVerify(100, scoreNameMatch("Ana", "Ana")), false);
});

test("OCR identifies supported Philippine ID types from structural text", () => {
  assert.equal(detectIdType("REPUBLIC OF THE PHILIPPINES PhilSys"), "PhilSys National ID");
  assert.equal(detectIdType("LAND TRANSPORTATION OFFICE LTO"), "Driver's License");
  assert.equal(detectIdType("REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE"), "Driver's License");
  assert.equal(detectIdType("LAND TRANSPORTATION OFFICE DRIVER LICENSE"), "Driver's License");
  assert.equal(detectIdType("POSTAL ID"), "Postal ID");
  assert.equal(detectIdType("UMID CRN"), "UMID");
  assert.equal(detectIdType("PhilPost Postal ID"), "Postal ID");
  assert.equal(detectIdType("COMELEC Voter Registration"), "Voter's ID");
  assert.equal(detectIdType("PASSPORT"), "Passport");
  assert.equal(detectIdType("Republic of the Philippines"), "Unknown");
});

test("ID side check rejects only clear back-side evidence", () => {
  assert.equal(classifyIdSide({
    extractedText: "SIGNATURE THUMBPRINT EMERGENCY CONTACT",
    ocrConfidence: 88,
    nameMatch: { firstNameMatched: false, lastNameMatched: false },
    detectedIdType: "Unknown",
  }), "back");
  assert.equal(classifyIdSide({
    extractedText: "CARDHOLDER SIGNATURE",
    ocrConfidence: 88,
    nameMatch: { firstNameMatched: false, lastNameMatched: false },
    detectedIdType: "Unknown",
  }), "uncertain");
});

test("ID side check recognizes a front when OCR confidently matches first and last names", () => {
  assert.equal(classifyIdSide({
    extractedText: "ANA CRUZ PHILSYS",
    ocrConfidence: 72,
    nameMatch: { firstNameMatched: true, lastNameMatched: true },
    detectedIdType: "PhilSys National ID",
  }), "front");
});

test("ID side check recognizes a readable driver's-license front when name OCR is incomplete", () => {
  assert.equal(classifyIdSide({
    extractedText: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE SURNAME GIVEN NAMES DATE OF BIRTH SEX ADDRESS",
    ocrConfidence: 86,
    nameMatch: { accuracy: 0, firstNameMatched: false, lastNameMatched: false },
    detectedIdType: "Driver's License",
  }), "front");
});

test("ID side check treats weak or ambiguous evidence as uncertain", () => {
  assert.equal(classifyIdSide({
    extractedText: "SIGNATURE",
    ocrConfidence: 80,
    nameMatch: { firstNameMatched: false, lastNameMatched: false },
    detectedIdType: "Unknown",
  }), "uncertain");
});

test("ID side pair check detects a clear swap when the matching name is only on the back image", () => {
  assert.equal(areIdSidesLikelySwapped(
    {
      ocrConfidence: 84,
      nameMatchAccuracy: 37,
      firstNameMatched: false,
      lastNameMatched: true,
    },
    {
      ocrConfidence: 76,
      nameMatchAccuracy: 100,
      firstNameMatched: true,
      lastNameMatched: true,
    }
  ), true);
});

test("ID side pair check detects a swapped driver's license when only the back has face-side layout", () => {
  assert.equal(areIdSidesLikelySwapped(
    {
      ocrConfidence: 74,
      nameMatchAccuracy: 0,
      firstNameMatched: false,
      lastNameMatched: false,
      detectedIdType: "Unknown",
      extractedText: "RESTRICTIONS QR CODE BARCODE",
    },
    {
      ocrConfidence: 56,
      nameMatchAccuracy: 0,
      firstNameMatched: false,
      lastNameMatched: false,
      detectedIdType: "Driver's License",
      extractedText: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE SURNAME GIVEN NAMES DATE OF BIRTH SEX",
    }
  ), true);
});

test("ID side pair check does not reject uncertain or correctly assigned sides", () => {
  assert.equal(areIdSidesLikelySwapped(
    {
      ocrConfidence: 76,
      nameMatchAccuracy: 100,
      firstNameMatched: true,
      lastNameMatched: true,
    },
    {
      ocrConfidence: 86,
      nameMatchAccuracy: 100,
      firstNameMatched: true,
      lastNameMatched: true,
    }
  ), false);
  assert.equal(areIdSidesLikelySwapped(
    { ocrConfidence: 35, nameMatchAccuracy: 75, firstNameMatched: true, lastNameMatched: true },
    { ocrConfidence: 59, nameMatchAccuracy: 100, firstNameMatched: true, lastNameMatched: true }
  ), false);
});

test("OCR selects a full account-name match over higher-confidence unrelated layout output", () => {
  const result = selectBestOCRCandidate([
    { confidence: 96, text: "MARIA SANTOS" },
    { confidence: 63, text: "ANA BEATRIZ CRUZ" },
  ], "Ana Beatriz Cruz");

  assert.equal(result.confidence, 63);
  assert.equal(result.text, "ANA BEATRIZ CRUZ");
  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(shouldAutoVerify(result.confidence, result.nameMatch), true);
});

test("OCR name matching fails closed when either side has no usable name parts", () => {
  assert.deepEqual(scoreNameMatch("", "Maria Santos"), {
    accuracy: 0,
    matchedParts: 0,
    totalParts: 2,
    firstNameMatched: false,
    lastNameMatched: false,
  });
  assert.deepEqual(scoreNameMatch("Maria Santos", ""), {
    accuracy: 0,
    matchedParts: 0,
    totalParts: 0,
    firstNameMatched: false,
    lastNameMatched: false,
  });
});
