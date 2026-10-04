const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const {
  OCR_LANGUAGES,
  OCR_SEGMENTATION_MODES,
  areIdSidesLikelySwapped,
  classifyIdSide,
  createIdOCRVariants,
  detectIdType,
  scoreLtoNameMatch,
  scoreNameMatch,
  selectBestOCRCandidate,
  shouldAutoVerify,
} = require("./ocrHelper");
const philippineIdNameFixtures = JSON.parse(fs.readFileSync(
  path.join(__dirname, "fixtures", "ph-id-name-layouts.json"),
  "utf8"
));

test("OCR supports English and Filipino IDs using multiple card layout modes", () => {
  assert.equal(OCR_LANGUAGES, "eng+fil");
  assert.deepEqual(OCR_SEGMENTATION_MODES, [
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

test("Philippine driver's-license surname-first layout matches a conventionally ordered profile name", () => {
  const result = scoreNameMatch(
    "CALIMLIM MIGUEL EDUARDO ESTRADA",
    "Miguel Eduardo Estrada Calimlim"
  );
  assert.equal(result.accuracy, 1);
  assert.equal(result.firstNameMatched, true);
  assert.equal(result.lastNameMatched, true);
});

test("LTO name matching tolerates one OCR character error in a long name token", () => {
  const result = scoreLtoNameMatch(
    "DRIVER'S LICENSE CALIML1M MIGUEL EDUARDO ESTRADA",
    "Miguel Eduardo Estrada Calimlim"
  );
  assert.ok(result.accuracy >= 0.9);
  assert.equal(result.firstNameMatched, true);
  assert.equal(result.lastNameMatched, false);
  assert.equal(shouldAutoVerify(87, result), false);
});

test("candidate selection applies LTO-aware matching to the one-line surname-first layout", () => {
  const result = selectBestOCRCandidate([
    {
      confidence: 87,
      text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE CALIML1M MIGUEL EDUARDO ESTRADA",
    },
  ], "Miguel Eduardo Estrada Calimlim");
  assert.equal(result.detectedIdType, "Driver's License");
  assert.ok(result.nameMatch.accuracy >= 0.9);
});

test("LTO name matching accepts an additional ID middle name when account first and last names match", () => {
  const result = selectBestOCRCandidate([{
    confidence: 87,
    text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE\nCALIMLIM, MIGUEL EDUARDO ESTRADA",
    lines: [
      { text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE" },
      { text: "CALIMLIM, MIGUEL EDUARDO ESTRADA" },
    ],
  }], "Miguel Eduardo Calimlim");

  assert.equal(result.detectedIdType, "Driver's License");
  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
});

test("LTO full-name line outranks a partial labeled-field match", () => {
  const result = selectBestOCRCandidate([{
    confidence: 87,
    text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE\nMIDDLE NAME: ESTRADA\nCALIMLIM, MIGUEL EDUARDO ESTRADA",
    lines: [
      { text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE" },
      { text: "MIDDLE NAME: ESTRADA" },
      { text: "CALIMLIM, MIGUEL EDUARDO ESTRADA" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.matchedParts, 4);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
});

test("LTO comma layout treats the text after the surname as given names and middle name", () => {
  const result = selectBestOCRCandidate([{
    confidence: 87,
    text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE\nCALIMLIM, MIGUEL EDUARDO ESTRADA",
    lines: [
      { text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE" },
      { text: "CALIMLIM, MIGUEL EDUARDO ESTRADA" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.matchedParts, 4);
});

test("full name split across labeled and unlabeled ID lines scores every matching name part", () => {
  const result = selectBestOCRCandidate([{
    confidence: 87,
    text: "DRIVER'S LICENSE MIDDLE NAME ESTRADA\nCALIMLIM MIGUEL EDUARDO",
    lines: [
      { text: "DRIVER'S LICENSE MIDDLE NAME ESTRADA" },
      { text: "CALIMLIM MIGUEL EDUARDO" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.matchedParts, 4);
  assert.equal(result.nameMatch.totalParts, 4);
});

test("LTO-aware candidate selection applies the card layout to a separate OCR name line", () => {
  const result = selectBestOCRCandidate([
    { confidence: 92, text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE" },
    { confidence: 68, text: "CALIML1M MIGUEL EDUARDO ESTRADA" },
  ], "Miguel Eduardo Estrada Calimlim");
  assert.ok(result.nameMatch.accuracy >= 0.9);
  assert.match(result.text, /CALIML1M MIGUEL EDUARDO ESTRADA/);
});

test("LTO name score combines the heading and comma-separated name read in separate OCR blocks", () => {
  const result = selectBestOCRCandidate([
    { confidence: 54, text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE" },
    { confidence: 63, text: "CALIMLIM, MIGUEL EDUARDO ESTRADA" },
  ], "MIGUEL EDUARDO ESTRADA CALIMLIM");

  assert.equal(result.detectedIdType, "Driver's License");
  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
});

test("synthetic Philippine ID layouts match structured names with conservative fallback", () => {
  for (const fixture of philippineIdNameFixtures) {
    const result = selectBestOCRCandidate([{
      confidence: fixture.ocrConfidence,
      text: fixture.lines.join("\n"),
      lines: fixture.lines,
    }], fixture.profile);
    assert.equal(result.detectedIdType, fixture.idType, fixture.idType);
    assert.equal(result.nameMatch.firstNameMatched, fixture.expectedFirstNameMatch, fixture.idType);
    assert.equal(result.nameMatch.lastNameMatched, fixture.expectedLastNameMatch, fixture.idType);
    assert.equal(shouldAutoVerify(result.confidence, result.nameMatch), fixture.expectedAutoVerify, fixture.idType);
  }
});

test("ID OCR keeps a small set of card-focused and rotated variants", async () => {
  const image = await sharp({
    create: { width: 1000, height: 1600, channels: 3, background: "#fff" },
  }).jpeg().toBuffer();
  const variants = await createIdOCRVariants(image);

  assert.equal(variants.length, 4);
  const processedMetadata = await sharp(variants[0]).metadata();
  assert.equal(processedMetadata.width, 1000);
  assert.equal(processedMetadata.height, 1600);
  const portraitCropMetadata = await sharp(variants[2]).metadata();
  assert.equal(portraitCropMetadata.width, 1600);
  assert.ok(portraitCropMetadata.height < 1000);
  const rotatedMetadata = await sharp(variants[3]).metadata();
  assert.equal(rotatedMetadata.width, 1600);
  assert.equal(rotatedMetadata.height, 1000);
});

test("OCR keeps the unmodified upload as a fallback when preprocessing cannot read it", async () => {
  const original = Buffer.from("synthetic invalid image");
  const originalWarn = console.warn;
  let variants;
  console.warn = () => {};
  try {
    variants = await createIdOCRVariants(original);
  } finally {
    console.warn = originalWarn;
  }
  assert.deepEqual(variants, [original]);
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

test("structured profile names match labeled fields regardless of the ID's name order", () => {
  const result = selectBestOCRCandidate([{
    confidence: 91,
    text: "PASSPORT\nSURNAME: CALIMLIM\nGIVEN NAMES: MIGUEL EDUARDO\nMIDDLE NAME: ESTRADA",
    lines: [
      { text: "PASSPORT" },
      { text: "SURNAME: CALIMLIM" },
      { text: "GIVEN NAMES: MIGUEL EDUARDO" },
      { text: "MIDDLE NAME: ESTRADA" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
  assert.equal(shouldAutoVerify(result.confidence, result.nameMatch), true);
});

test("labeled name values on separate rows match and missing optional middle names remain eligible", () => {
  const result = selectBestOCRCandidate([{
    confidence: 82,
    text: "DRIVER'S LICENSE\nSURNAME\nCALIMLIM\nGIVEN NAMES\nMIGUEL EDUARDO",
    lines: [
      { text: "DRIVER'S LICENSE" },
      { text: "SURNAME" },
      { text: "CALIMLIM" },
      { text: "GIVEN NAMES" },
      { text: "MIGUEL EDUARDO" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 0.75);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
  assert.equal(shouldAutoVerify(result.confidence, result.nameMatch), true);
});

test("labeled name columns use OCR word positions to associate values with labels", () => {
  const result = selectBestOCRCandidate([{
    confidence: 89,
    text: "SURNAME GIVEN NAMES\nCALIMLIM MIGUEL EDUARDO",
    lines: [
      {
        text: "SURNAME GIVEN NAMES",
        words: [
          { text: "SURNAME", bbox: { x0: 10, x1: 80 } },
          { text: "GIVEN", bbox: { x0: 150, x1: 200 } },
          { text: "NAMES", bbox: { x0: 205, x1: 260 } },
        ],
      },
      {
        text: "CALIMLIM MIGUEL EDUARDO",
        words: [
          { text: "CALIMLIM", bbox: { x0: 12, x1: 95 } },
          { text: "MIGUEL", bbox: { x0: 150, x1: 215 } },
          { text: "EDUARDO", bbox: { x0: 220, x1: 300 } },
        ],
      },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
});

test("labeled name matching does not borrow a surname from unrelated ID text", () => {
  const result = selectBestOCRCandidate([{
    confidence: 95,
    text: "GIVEN NAMES: MIGUEL EDUARDO\nADDRESS: CALIMLIM STREET",
    lines: [
      { text: "GIVEN NAMES: MIGUEL EDUARDO" },
      { text: "ADDRESS: CALIMLIM STREET" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, false);
  assert.equal(shouldAutoVerify(result.confidence, result.nameMatch), false);
});

test("driver's-license name order remains matchable when OCR reads labels separately from values", () => {
  const result = selectBestOCRCandidate([{
    confidence: 88,
    text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE\nLAST NAME FIRST NAME MIDDLE NAME\nCALIMLIM MIGUEL EDUARDO ESTRADA",
    lines: [
      { text: "REPUBLIC OF THE PHILIPPINES DRIVER'S LICENSE" },
      { text: "LAST NAME FIRST NAME MIDDLE NAME" },
      { text: "CALIMLIM MIGUEL EDUARDO ESTRADA" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
  assert.equal(shouldAutoVerify(result.confidence, result.nameMatch), true);
});

test("unlabeled names split across adjacent ID rows are compared independent of order", () => {
  const result = selectBestOCRCandidate([{
    confidence: 88,
    text: "CALIMLIM\nMIGUEL EDUARDO\nESTRADA",
    lines: [
      { text: "CALIMLIM" },
      { text: "MIGUEL EDUARDO" },
      { text: "ESTRADA" },
    ],
  }], {
    firstName: "Miguel Eduardo",
    middleName: "Estrada",
    lastName: "Calimlim",
  });

  assert.equal(result.nameMatch.accuracy, 1);
  assert.equal(result.nameMatch.firstNameMatched, true);
  assert.equal(result.nameMatch.lastNameMatched, true);
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
