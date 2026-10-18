const Tesseract = require("tesseract.js");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sharp = require("sharp");
const { getAgeFromDateOfBirth } = require("./providerAge");

const OCR_LANGUAGES = "eng";
const OCR_SEGMENTATION_MODES = ["4", "6", "7", "8"];
const OCR_ROTATIONS = [0, 90, 180, 270];
const OCR_IMAGE_DIMENSION = 2200;
const OCR_CACHE_PATH = path.join(os.tmpdir(), "taskpanda-tesseract");
const HEADER_ANCHORS = [
  "REPUBLIKA NG PILIPINAS",
  "PAMBANSANG PAGKAKAKILANLAN",
  "PHILIPPINE NATIONAL ID",
];
const NAME_LABELS = {
  lastName: /\b(?:APELYIDO|LAST\s+NAME|SURNAME)\b/i,
  firstName: /\b(?:MGA\s+PANGALAN|GIVEN\s+NAMES?|FIRST\s+NAME)\b/i,
  middleName: /\b(?:GITNANG\s+(?:APELYIDO|PANGALAN)|M[I1]D(?:D|O)LE\s+NAME)\b/i,
};
const NORMALIZED_NAME_LABELS = new Set([
  "apelyido",
  "last name",
  "surname",
  "mga pangalan",
  "given names",
  "given name",
  "first name",
  "gitnang apelyido",
  "gitnang pangalan",
  "middle name",
  "midd e name",
]);
const DOB_LABEL = /\b(?:PETSA\s+NG\s+KAPANGANAKAN|DATE\s+OF\s+BIRTH)\b/i;
const IDENTIFIER_LABEL = /\b(?:PSN|PCN|PHILSYS\s+(?:CARD|DIGITAL)?\s*NUMBER|DIGITAL\s+ID\s+NUMBER|PHILIPPINE\s+IDENTIFICATION\s+NUMBER)\b/i;
const MONTHS = new Map([
  ["JANUARY", 1], ["ENERO", 1],
  ["FEBRUARY", 2], ["PEBRERO", 2],
  ["MARCH", 3], ["MARSO", 3],
  ["APRIL", 4], ["ABRIL", 4],
  ["MAY", 5], ["MAYO", 5],
  ["JUNE", 6], ["HUNYO", 6],
  ["JULY", 7], ["HULYO", 7],
  ["AUGUST", 8], ["AGOSTO", 8],
  ["SEPTEMBER", 9], ["SETYEMBRE", 9], ["SEPTIEMBRE", 9],
  ["OCTOBER", 10], ["OKTUBRE", 10],
  ["NOVEMBER", 11], ["NOBYEMBRE", 11],
  ["DECEMBER", 12], ["DISYEMBRE", 12],
]);
const CONFUSION_MAP = new Map([
  ["O", "0"], ["Q", "0"], ["D", "0"],
  ["I", "1"], ["L", "1"],
  ["S", "5"], ["B", "8"],
]);

let workerPromise;
let ocrJobQueue = Promise.resolve();

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeHeaderText(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function hasPhilSysHeader(text) {
  const normalized = normalizeHeaderText(text);
  return HEADER_ANCHORS.some((anchor) =>
    normalized.includes(normalizeHeaderText(anchor))
  );
}

function correctNumericCharacters(value) {
  return [...String(value || "").toUpperCase()]
    .map((character) => CONFUSION_MAP.get(character) || character)
    .join("");
}

function validCalendarDate(year, month, day) {
  if (year < 1900 || year > new Date().getUTCFullYear()) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

function parseDateOfBirth(value) {
  const original = String(value || "").toUpperCase();
  const monthPattern = [...MONTHS.keys()].join("|");
  const monthFirst = new RegExp(`\\b(${monthPattern})\\s*[,']?\\s*(\\d{1,2})(?:ST|ND|RD|TH)?[,']?\\s+(\\d{4})\\b`).exec(original);
  if (monthFirst) return validCalendarDate(Number(monthFirst[3]), MONTHS.get(monthFirst[1]), Number(monthFirst[2]));
  const dayFirst = new RegExp(`\\b(\\d{1,2})(?:ST|ND|RD|TH)?\\s+(${monthPattern})[,]?\\s+(\\d{4})\\b`).exec(original);
  if (dayFirst) return validCalendarDate(Number(dayFirst[3]), MONTHS.get(dayFirst[2]), Number(dayFirst[1]));

  const corrected = correctNumericCharacters(original);
  const iso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(corrected);
  if (iso) return validCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const numeric = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/.exec(corrected);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = Number(numeric[3]);
    const month = first > 12 ? second : first;
    const day = first > 12 ? first : second;
    return validCalendarDate(year, month, day);
  }

  return null;
}

function getLines(candidate) {
  if (Array.isArray(candidate.lines) && candidate.lines.length) {
    return candidate.lines.map((line) =>
      typeof line === "string" ? { text: line } : line
    ).filter((line) => String(line.text || "").trim());
  }
  return String(candidate.text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((text) => ({ text }));
}

function fieldValueFromLine(line, pattern) {
  const match = pattern.exec(line);
  if (!match) return "";
  const remainder = line.slice(match.index + match[0].length);
  const otherPatterns = [...Object.values(NAME_LABELS), DOB_LABEL, IDENTIFIER_LABEL]
    .filter((candidate) => candidate !== pattern);
  const nextLabelIndex = otherPatterns.reduce((nextIndex, candidate) => {
    const nextLabel = candidate.exec(remainder);
    return nextLabel && nextLabel.index > 0
      ? Math.min(nextIndex, nextLabel.index)
      : nextIndex;
  }, remainder.length);
  return remainder.slice(0, nextLabelIndex)
    .replace(new RegExp(pattern.source, "gi"), " ")
    .replace(/^[\s:|\/—-]+|[\s:|\/—-]+$/g, "")
    .trim();
}

function readAnchoredField(lines, pattern) {
  for (let index = 0; index < lines.length; index += 1) {
    const value = fieldValueFromLine(String(lines[index].text || ""), pattern);
    if (value) return value;
    if (pattern.test(String(lines[index].text || ""))) {
      const next = lines[index + 1];
      if (next && !Object.values(NAME_LABELS).some((label) => label.test(next.text)) &&
        !DOB_LABEL.test(next.text) && !IDENTIFIER_LABEL.test(next.text)) {
        return String(next.text || "").trim();
      }
    }
  }
  return "";
}

function extractNameFields(lines) {
  const fields = {};
  for (const [field, pattern] of Object.entries(NAME_LABELS)) {
    fields[field] = readAnchoredField(lines, pattern);
  }

  const labelLine = lines.find((line) =>
    Object.values(NAME_LABELS).filter((pattern) => pattern.test(line.text || "")).length > 1
  );
  const nextLine = labelLine && lines[lines.indexOf(labelLine) + 1];
  if (labelLine && nextLine?.words?.length) {
    const labelWords = labelLine.words;
    const centers = Object.entries(NAME_LABELS).flatMap(([field, pattern]) => {
      const label = String(labelLine.text || "");
      const match = pattern.exec(label);
      if (!match) return [];
      const normalizedLabel = normalizeHeaderText(match[0]).split(" ");
      for (let start = 0; start <= labelWords.length - normalizedLabel.length; start += 1) {
        const group = labelWords.slice(start, start + normalizedLabel.length);
        if (group.map(({ text }) => normalizeHeaderText(text)).join(" ") !== normalizedLabel.join(" ")) continue;
        const boxes = group.map(({ bbox }) => bbox).filter((bbox) => Number.isFinite(bbox?.x0) && Number.isFinite(bbox?.x1));
        if (boxes.length) {
          centers.push({
            field,
            center: (Math.min(...boxes.map(({ x0 }) => x0)) + Math.max(...boxes.map(({ x1 }) => x1))) / 2,
          });
        }
        break;
      }
      return [];
    }).sort((left, right) => left.center - right.center);

    if (centers.length > 1) {
      for (let index = 0; index < centers.length; index += 1) {
        const lower = index === 0 ? -Infinity : (centers[index - 1].center + centers[index].center) / 2;
        const upper = index === centers.length - 1 ? Infinity : (centers[index].center + centers[index + 1].center) / 2;
        const value = nextLine.words
          .filter(({ bbox }) => {
            const center = (bbox?.x0 + bbox?.x1) / 2;
            return Number.isFinite(center) && center > lower && center <= upper;
          })
          .map(({ text }) => text)
          .join(" ")
          .trim();
        if (value) fields[centers[index].field] = value;
      }
    }
  }
  return fields;
}

function extractIdentifier(text, lines = []) {
  const candidates = [];
  const addCandidate = (value, labeled) => {
    const rawValue = String(value || "");
    const label = IDENTIFIER_LABEL.exec(rawValue);
    const numericValue = label
      ? rawValue.slice(label.index + label[0].length)
      : rawValue;
    const corrected = correctNumericCharacters(numericValue);
    const digits = corrected.replace(/\D/g, "");
    if (digits.length === 12 || digits.length === 16) {
      candidates.push({ digits, type: digits.length === 16 ? "PCN" : "PSN", labeled });
    }
  };

  const sourceLines = Array.isArray(lines) && lines.length
    ? lines
    : String(text || "").split(/\r?\n/).map((line) => ({ text: line }));
  for (let index = 0; index < sourceLines.length; index += 1) {
    const line = String(sourceLines[index].text || "");
    if (!IDENTIFIER_LABEL.test(line)) continue;
    addCandidate(line, true);
    if (!candidates.some((candidate) => candidate.labeled) && sourceLines[index + 1]) {
      addCandidate(sourceLines[index + 1].text, true);
    }
  }

  const fourDigitGroups = /(?<![0-9OQDILSB])([0-9OQDILSB]{4})[-\s]?([0-9OQDILSB]{4})[-\s]?([0-9OQDILSB]{4})[-\sLI]?([0-9OQDILSB]{4})(?![0-9OQDILSB])/gi;
  for (const line of sourceLines) {
    for (const match of String(line.text || "").matchAll(fourDigitGroups)) {
      addCandidate(match.slice(1, 5).join("-"), false);
    }
  }

  const normalizedText = String(text || "");
  for (const match of normalizedText.matchAll(/(?<![0-9OQDILSB])[0-9OQDILSB]{4}(?:[\s-]?[0-9OQDILSB]{4}){2,3}(?![0-9OQDILSB])/gi)) {
    addCandidate(match[0], false);
  }
  for (const match of normalizedText.matchAll(/(?<![0-9OQDILSB])[0-9OQDILSB]{16}(?![0-9OQDILSB])|(?<![0-9OQDILSB])[0-9OQDILSB]{12}(?![0-9OQDILSB])/gi)) {
    addCandidate(match[0], false);
  }
  return candidates.sort((left, right) => Number(right.labeled) - Number(left.labeled))[0] || null;
}

function cleanRegionField(value, labelPattern) {
  return String(value || "")
    .replace(new RegExp(labelPattern.source, "gi"), " ")
    .replace(/[^\p{L}\p{M}0-9,'./ -]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveIdentifier(globalIdentifier, targetedIdentifiers) {
  const targeted = targetedIdentifiers.filter(Boolean);
  if (!targeted.length) return globalIdentifier;

  const counts = new Map();
  for (const identifier of targeted) {
    counts.set(identifier.digits, (counts.get(identifier.digits) || 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) return null;
  const [digits, votes] = ranked[0];
  if (votes < 2 && globalIdentifier?.digits !== digits) return null;
  return targeted.find((identifier) => identifier.digits === digits) ||
    globalIdentifier;
}

function selectOCRConfidence(documentConfidence, identifierReadings, selectedIdentifier) {
  const relevantReadings = selectedIdentifier
    ? identifierReadings
      .filter(({ identifier }) => identifier?.digits === selectedIdentifier.digits)
      .map(({ confidence }) => confidence)
    : [];
  return Math.max(
    0,
    Math.min(100, Number(documentConfidence) || 0),
    ...relevantReadings.map((confidence) => Math.max(0, Math.min(100, Number(confidence) || 0))),
  );
}

function normalizeAccountDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const string = String(value);
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(string);
  return iso?.[1] || parseDateOfBirth(string);
}

function levenshteinDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = previous[0];
    previous[0] = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const prior = previous[rightIndex];
      previous[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + 1,
        diagonal + Number(left[leftIndex - 1] !== right[rightIndex - 1])
      );
      diagonal = prior;
    }
  }
  return previous[right.length];
}

function similarity(left, right) {
  const expected = normalizeText(left);
  const actual = normalizeText(right);
  if (!expected || !actual) return 0;
  return expected === actual
    ? 1
    : Math.max(0, 1 - levenshteinDistance(expected, actual) / Math.max(expected.length, actual.length));
}

function calculateVerificationScore(result, role = result.role) {
  const validIdentifier = /^\d{12}$|^\d{16}$/.test(result.identifier?.digits || "");
  const components = [
    { score: validIdentifier ? 100 : 0, weight: 50 },
    { score: Math.max(0, Math.min(100, Number(result.nameMatchAccuracy) || 0)), weight: 30 },
  ];

  if (role === "provider") {
    const dobEligible = Boolean(
      result.parsedDateOfBirth &&
      result.dateOfBirthMatched &&
      result.providerAge !== null &&
      result.providerAge >= 18
    );
    components.push({ score: dobEligible ? 100 : 0, weight: 20 });
  }

  const totalWeight = components.reduce((total, component) => total + component.weight, 0);
  return Math.round(
    components.reduce((total, component) => total + component.score * component.weight, 0) /
    totalWeight,
  );
}

function evaluateOCRCandidate(candidate, profile = {}) {
  const lines = getLines(candidate);
  const text = candidate.text || lines.map(({ text: line }) => line).join("\n");
  const fields = extractNameFields(lines);
  const identifier = Object.prototype.hasOwnProperty.call(candidate, "identifier")
    ? candidate.identifier
    : extractIdentifier(text, lines);
  const dobText = readAnchoredField(lines, DOB_LABEL);
  const dateOfBirth = parseDateOfBirth(dobText);
  const firstNameAccuracy = similarity(profile.firstName, fields.firstName);
  const lastNameAccuracy = similarity(profile.lastName, fields.lastName);
  const expectedFullName = normalizeText(profile.fullName);
  const extractedFullName = normalizeText([
    fields.firstName,
    fields.middleName,
    fields.lastName,
  ].filter(Boolean).join(" "));
  const fullNameMatched = Boolean(expectedFullName) && expectedFullName === extractedFullName;
  const nameMatchAccuracy = expectedFullName
    ? Math.round(similarity(expectedFullName, extractedFullName) * 100)
    : Math.round(((firstNameAccuracy + lastNameAccuracy) / 2) * 100);
  const firstNameMatched = Boolean(normalizeText(profile.firstName)) &&
    normalizeText(profile.firstName) === normalizeText(fields.firstName);
  const lastNameMatched = Boolean(normalizeText(profile.lastName)) &&
    normalizeText(profile.lastName) === normalizeText(fields.lastName);
  const accountDate = normalizeAccountDate(profile.dateOfBirth);
  const dobMatched = Boolean(dateOfBirth && accountDate && dateOfBirth === accountDate);
  const age = profile.role === "provider" && dateOfBirth
    ? getAgeFromDateOfBirth(dateOfBirth)
    : null;
  const ageEligible = profile.role !== "provider" || age !== null && age >= 18;
  const ocrConfidence = Math.max(0, Math.min(100, Number(candidate.confidence) || 0));
  const headerMatched = hasPhilSysHeader(text);
  const identityValid = headerMatched && Boolean(identifier);
  const verificationScore = calculateVerificationScore({
    identifier,
    nameMatchAccuracy,
    parsedDateOfBirth: dateOfBirth,
    dateOfBirthMatched: dobMatched,
    providerAge: age,
    role: profile.role,
  }, profile.role);
  const autoVerified = identityValid &&
    verificationScore >= 85 &&
    nameMatchAccuracy >= 85 &&
    (profile.role !== "provider" || dobMatched) &&
    ageEligible;

  return {
    autoVerified,
    dateOfBirthMatched: dobMatched,
    detectedIdType: identifier?.type || "",
    extractedText: text,
    fields,
    firstNameMatched,
    headerMatched,
    identityValid,
    identifier,
    lastNameMatched,
    lines,
    nameMatchAccuracy,
    ocrConfidence,
    parsedDateOfBirth: dateOfBirth,
    providerAge: age,
    providerAgeEligible: ageEligible,
    role: profile.role || "",
    verificationScore,
  };
}

function compareOCRCandidates(left, right) {
  const leftScore = Number(left.headerMatched) * 1000 +
    Number(Boolean(left.identifier)) * 600 +
    left.nameMatchAccuracy * 10 +
    Number(left.dateOfBirthMatched) * 75 +
    Number(Boolean(left.fields.firstName)) * 100 +
    Number(Boolean(left.fields.lastName)) * 100 +
    Number(Boolean(left.parsedDateOfBirth)) * 50 +
    left.ocrConfidence;
  const rightScore = Number(right.headerMatched) * 1000 +
    Number(Boolean(right.identifier)) * 600 +
    right.nameMatchAccuracy * 10 +
    Number(right.dateOfBirthMatched) * 75 +
    Number(Boolean(right.fields.firstName)) * 100 +
    Number(Boolean(right.fields.lastName)) * 100 +
    Number(Boolean(right.parsedDateOfBirth)) * 50 +
    right.ocrConfidence;
  return rightScore - leftScore;
}

function needsFieldRescan(result, profile) {
  return result.ocrConfidence < 90 ||
    !result.identifier ||
    result.nameMatchAccuracy < 90 ||
    !result.fields.firstName ||
    !result.fields.lastName ||
    profile.role === "provider" && !result.parsedDateOfBirth;
}

function adaptiveBinarize(pixels, width, height, channels) {
  const integralWidth = width + 1;
  const integral = new Float64Array(integralWidth * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowTotal = 0;
    for (let x = 1; x <= width; x += 1) {
      rowTotal += pixels[(y - 1) * width + x - 1] * channels;
      integral[y * integralWidth + x] = integral[(y - 1) * integralWidth + x] + rowTotal;
    }
  }

  const radius = 15;
  const output = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    const top = Math.max(0, y - radius);
    const bottom = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x += 1) {
      const left = Math.max(0, x - radius);
      const right = Math.min(width, x + radius + 1);
      const sum = integral[bottom * integralWidth + right] -
        integral[top * integralWidth + right] -
        integral[bottom * integralWidth + left] +
        integral[top * integralWidth + left];
      const mean = sum / ((bottom - top) * (right - left));
      output[y * width + x] = pixels[y * width + x] > mean - 6 ? 255 : 0;
    }
  }
  return output;
}

function findBrightRegion(values, minimumRatio = 0.45) {
  const hits = [];
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= minimumRatio) hits.push(index);
  }
  if (!hits.length) return null;

  const maxGap = Math.ceil(values.length * 0.01);
  let previous = hits[0];
  for (const hit of hits.slice(1)) {
    if (hit - previous > maxGap + 1) return null;
    previous = hit;
  }
  return { start: hits[0], end: hits[hits.length - 1] + 1 };
}

function detectCardBounds(grayscale, width, height) {
  const step = Math.max(1, Math.ceil(Math.max(width, height) / 600));
  const sampleWidth = Math.ceil(width / step);
  const sampleHeight = Math.ceil(height / step);
  const rowCoverage = new Array(sampleHeight).fill(0);
  const columnCoverage = new Array(sampleWidth).fill(0);

  for (let sampleY = 0; sampleY < sampleHeight; sampleY += 1) {
    let brightPixels = 0;
    for (let sampleX = 0; sampleX < sampleWidth; sampleX += 1) {
      const pixel = grayscale[
        Math.min(height - 1, sampleY * step) * width +
        Math.min(width - 1, sampleX * step)
      ];
      if (pixel >= 100) {
        brightPixels += 1;
        columnCoverage[sampleX] += 1;
      }
    }
    rowCoverage[sampleY] = brightPixels / sampleWidth;
  }
  for (let sampleX = 0; sampleX < sampleWidth; sampleX += 1) {
    columnCoverage[sampleX] /= sampleHeight;
  }

  const rows = findBrightRegion(rowCoverage);
  const columns = findBrightRegion(columnCoverage);
  if (!rows || !columns) return null;
  const leftSample = Math.max(0, columns.start - Math.ceil(sampleWidth * 0.005));
  const rightSample = Math.min(sampleWidth, columns.end + Math.ceil(sampleWidth * 0.005));
  const topSample = Math.max(0, rows.start - Math.ceil(sampleHeight * 0.005));
  const bottomSample = Math.min(sampleHeight, rows.end + Math.ceil(sampleHeight * 0.005));
  const left = leftSample * step;
  const top = topSample * step;
  const right = Math.min(width, rightSample * step);
  const bottom = Math.min(height, bottomSample * step);
  const regionWidth = right - left;
  const regionHeight = bottom - top;
  const aspectRatio = regionWidth / regionHeight;

  if (
    regionWidth / width < 0.5 ||
    regionHeight / height < 0.5 ||
    aspectRatio < 1.3 ||
    aspectRatio > 2.1
  ) return null;

  return { left, top, width: regionWidth, height: regionHeight };
}

async function createIdOCRVariants(image) {
  const source = Buffer.isBuffer(image) ? image : await fs.readFile(image);
  const variants = [];
  for (const rotation of OCR_ROTATIONS) {
    const rotated = sharp(source, { limitInputPixels: 16_000_000 })
      .rotate()
      .rotate(rotation, { background: "#ffffff" })
      .resize({
        width: OCR_IMAGE_DIMENSION,
        height: OCR_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: false,
      });
    let color = await rotated.clone().png().toBuffer();
    let { data, info } = await rotated.clone().greyscale().raw().toBuffer({ resolveWithObject: true });
    let grayscale = info.channels === 1
      ? data
      : await sharp(data, { raw: info }).greyscale().raw().toBuffer();
    const cardBounds = detectCardBounds(grayscale, info.width, info.height);
    if (cardBounds) {
      const cropped = await sharp(grayscale, {
        raw: { width: info.width, height: info.height, channels: 1 },
      }).extract(cardBounds).greyscale().raw().toBuffer({ resolveWithObject: true });
      grayscale = cropped.data;
      info = cropped.info;
      color = await sharp(color).extract(cardBounds).png().toBuffer();
    }
    const adaptive = adaptiveBinarize(grayscale, info.width, info.height, 1);
    variants.push({
      color,
      enhanced: await sharp(grayscale, {
        raw: { width: info.width, height: info.height, channels: 1 },
      }).png().withMetadata({ density: 300 }).toBuffer(),
      binary: await sharp(adaptive, {
        raw: { width: info.width, height: info.height, channels: 1 },
      }).png().withMetadata({ density: 300 }).toBuffer(),
      width: info.width,
      height: info.height,
      cardAspectRatio: info.width / info.height,
      rotation,
    });
  }
  return variants;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await fs.mkdir(OCR_CACHE_PATH, { recursive: true });
      return Tesseract.createWorker(OCR_LANGUAGES, Tesseract.OEM.LSTM_ONLY, {
        cachePath: OCR_CACHE_PATH,
      });
    })();
  }
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

function warmOCRWorker() {
  return getWorker();
}

async function recognize(worker, image, pageSegmentationMode, whitelist = "") {
  await worker.setParameters({
    tessedit_pageseg_mode: pageSegmentationMode,
    tessedit_char_whitelist: whitelist,
  });
  const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
  const lines = Array.isArray(data.lines)
    ? data.lines.map(({ text, bbox, words }) => ({
      text,
      bbox,
      words: Array.isArray(words)
        ? words.map(({ text: wordText, bbox: wordBbox }) => ({ text: wordText, bbox: wordBbox }))
        : undefined,
    }))
    : [];
  return { confidence: data.confidence, text: data.text, lines };
}

async function cropForField(variant, line, nextLine) {
  const first = line?.bbox;
  const second = nextLine?.bbox;
  if (!first || !Number.isFinite(first.x0) || !Number.isFinite(first.y0)) return null;
  const top = Math.max(0, Math.floor(first.y0 - 32));
  const bottom = Math.min(variant.height, Math.ceil((second?.y1 || first.y1) + 42));
  if (bottom <= top) return null;
  return sharp(variant.enhanced).extract({
    left: 0,
    top,
    width: variant.width,
    height: bottom - top,
  }).png().toBuffer();
}

async function cropCardRegion(variant, region, source = "enhanced") {
  const left = Math.floor(variant.width * region.left);
  const top = Math.floor(variant.height * region.top);
  const width = Math.min(variant.width - left, Math.ceil(variant.width * region.width));
  const height = Math.min(variant.height - top, Math.ceil(variant.height * region.height));
  if (width <= 0 || height <= 0) return null;
  return sharp(variant[source])
    .extract({ left, top, width, height })
    .png()
    .withMetadata({ density: 300 })
    .toBuffer();
}

function isPhysicalCardLayout(lines, aspectRatio) {
  const hasInlineFields = lines.some((line) =>
    Object.values(NAME_LABELS).some((pattern) => {
      const value = fieldValueFromLine(String(line.text || ""), pattern);
      return value && !NORMALIZED_NAME_LABELS.has(normalizeHeaderText(value)) &&
        !Object.values(NAME_LABELS).some((label) => label.test(value));
    })
  );
  return !hasInlineFields && (aspectRatio ? aspectRatio < 1.68 : true);
}

async function readTargetedIdentifiers(worker, variant, documentLines = []) {
  const physicalLayout = isPhysicalCardLayout(documentLines, variant.cardAspectRatio);
  const crop = await cropCardRegion(variant, {
    left: physicalLayout ? 0.04 : 0.06,
    top: physicalLayout ? 0.25 : 0.31,
    width: physicalLayout ? 0.40 : 0.36,
    height: 0.09,
  });
  if (!crop) return [];

  const readings = [];
  for (const [contrast, offset] of [[1, 0], [1.35, -30], [1.6, -50]]) {
    const enhancedCrop = await sharp(crop)
      .linear(contrast, offset)
      .resize({ width: 2400 })
      .png()
      .toBuffer();
    for (const mode of [OCR_SEGMENTATION_MODES[2], OCR_SEGMENTATION_MODES[3]]) {
      const result = await recognize(worker, enhancedCrop, mode, "0123456789-");
      const identifier = extractIdentifier(result.text.replace(/\s+/g, ""));
      if (identifier) readings.push({ identifier, confidence: result.confidence });
    }
  }
  return readings;
}

async function readTargetedFields(worker, variant, profile, documentLines = []) {
  const physicalLayout = isPhysicalCardLayout(documentLines, variant.cardAspectRatio);
  const fields = [
    {
      key: "lastName",
      label: "APELYIDO",
      left: physicalLayout ? 0.45 : 0.35,
      top: physicalLayout ? 0.39 : 0.35,
      width: physicalLayout ? 0.21 : 0.20,
    },
    {
      key: "firstName",
      label: "MGA PANGALAN",
      left: physicalLayout ? 0.43 : 0.35,
      top: physicalLayout ? 0.50 : 0.45,
      width: physicalLayout ? 0.45 : 0.28,
    },
    {
      key: "middleName",
      label: "GITNANG APELYIDO",
      left: physicalLayout ? 0.43 : 0.35,
      top: physicalLayout ? 0.64 : 0.56,
      width: physicalLayout ? 0.44 : 0.20,
      height: physicalLayout ? 0.07 : 0.06,
    },
    ...(profile.role === "provider"
      ? [{
        key: "dateOfBirth",
        label: "PETSA NG KAPANGANAKAN",
        left: physicalLayout ? 0.43 : 0.35,
        top: physicalLayout ? 0.74 : 0.68,
        width: physicalLayout ? 0.54 : 0.40,
        height: physicalLayout ? 0.08 : 0.06,
      }]
      : []),
  ];
  const lines = [];

  for (const field of fields) {
    const crop = await cropCardRegion(variant, {
      left: field.left,
      top: field.top,
      width: field.width,
      height: field.height || 0.06,
    }, physicalLayout ? "color" : "enhanced");
    if (!crop) continue;
    const enlargedCrop = await sharp(crop)
      .resize({ width: 1800 })
      .png()
      .toBuffer();
    const whitelist = field.key === "dateOfBirth"
      ? "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789,'./ -"
      : "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz' -";
    const result = await recognize(worker, enlargedCrop, OCR_SEGMENTATION_MODES[2], whitelist);
    const text = cleanRegionField(
      result.text,
      field.key === "dateOfBirth" ? DOB_LABEL : NAME_LABELS[field.key],
    );
    if (!text) continue;
    const label = field.key === "dateOfBirth" ? "PETSA NG KAPANGANAKAN" : field.label;
    lines.push({ text: `${label}: ${text}` });
  }

  return { lines };
}

async function runOCR(image, profile = {}) {
  const worker = await getWorker();
  const variants = await createIdOCRVariants(image);
  let bestResult = null;
  let bestVariant = variants[0];

  for (const variant of variants) {
    const firstPass = await recognize(worker, variant.enhanced, OCR_SEGMENTATION_MODES[0]);
    let current = evaluateOCRCandidate(firstPass, profile);
    if (!current.headerMatched || !current.identifier || current.ocrConfidence < 90) {
      const secondPass = await recognize(worker, variant.enhanced, OCR_SEGMENTATION_MODES[1]);
      const secondCandidate = evaluateOCRCandidate(secondPass, profile);
      const combinedCandidate = evaluateOCRCandidate({
        confidence: Math.max(current.ocrConfidence, secondPass.confidence),
        text: [current.extractedText, secondPass.text].join("\n"),
        lines: [...secondPass.lines, ...current.lines],
      }, profile);
      if (compareOCRCandidates(secondCandidate, current) < 0) current = secondCandidate;
      if (compareOCRCandidates(combinedCandidate, current) < 0) current = combinedCandidate;
      if (current.ocrConfidence < 75) {
        const binaryPass = await recognize(worker, variant.binary, OCR_SEGMENTATION_MODES[1]);
        const binaryCandidate = evaluateOCRCandidate(binaryPass, profile);
        const combinedBinaryCandidate = evaluateOCRCandidate({
          confidence: Math.max(current.ocrConfidence, binaryPass.confidence),
          text: [current.extractedText, binaryPass.text].join("\n"),
          lines: [...binaryPass.lines, ...current.lines],
        }, profile);
        if (compareOCRCandidates(binaryCandidate, current) < 0) current = binaryCandidate;
        if (compareOCRCandidates(combinedBinaryCandidate, current) < 0) current = combinedBinaryCandidate;
      }
    }
    if (!bestResult || compareOCRCandidates(current, bestResult) < 0) {
      bestResult = current;
      bestVariant = variant;
    }
    if (current.headerMatched) {
      bestResult = current;
      bestVariant = variant;
      break;
    }
  }

  const fullDocumentConfidence = bestResult?.ocrConfidence || 0;
  let reportedConfidence = fullDocumentConfidence;
  if (bestResult?.headerMatched && bestVariant.width / bestVariant.height >= 1.35) {
    const targetedReadings = await readTargetedIdentifiers(
      worker,
      bestVariant,
      bestResult.lines,
    );
    const identifier = resolveIdentifier(
      bestResult.identifier,
      targetedReadings.map(({ identifier: reading }) => reading),
    );
    reportedConfidence = selectOCRConfidence(
      fullDocumentConfidence,
      targetedReadings,
      identifier,
    );
    if (targetedReadings.length || identifier !== bestResult.identifier) {
      bestResult = evaluateOCRCandidate({
        confidence: bestResult.ocrConfidence,
        text: bestResult.extractedText,
        lines: bestResult.lines,
        identifier,
      }, profile);
    }
  }

  if (bestResult?.headerMatched && bestVariant.width / bestVariant.height >= 1.35 &&
    (bestResult.nameMatchAccuracy < 100 ||
      profile.role === "provider" && !bestResult.parsedDateOfBirth)) {
    const targetedFields = await readTargetedFields(
      worker,
      bestVariant,
      profile,
      bestResult.lines,
    );
    if (targetedFields.lines.length) {
      const rescannedFields = evaluateOCRCandidate({
        confidence: Math.max(bestResult.ocrConfidence, targetedFields.confidence),
        text: bestResult.extractedText,
        lines: [...targetedFields.lines, ...bestResult.lines],
        identifier: bestResult.identifier,
      }, profile);
      if (compareOCRCandidates(rescannedFields, bestResult) < 0) bestResult = rescannedFields;
    }
  }

  if (!bestResult || needsFieldRescan(bestResult, profile)) {
    if (bestResult.headerMatched && bestVariant.width / bestVariant.height >= 1.35) {
      const rescans = [];
      if (bestResult.nameMatchAccuracy < 90 ||
        !bestResult.fields.firstName ||
        !bestResult.fields.lastName ||
        profile.role === "provider" && !bestResult.parsedDateOfBirth) {
        const detailsCrop = await cropCardRegion(bestVariant, {
          left: 0.32,
          top: 0.27,
          width: 0.48,
          height: 0.52,
        });
        if (detailsCrop) {
          rescans.push(await recognize(worker, detailsCrop, OCR_SEGMENTATION_MODES[1]));
          rescans.push(await recognize(worker, detailsCrop, OCR_SEGMENTATION_MODES[2]));
        }
      }
      if (rescans.length) {
        const rescanned = evaluateOCRCandidate({
          confidence: Math.max(bestResult.ocrConfidence, ...rescans.map(({ confidence }) => confidence)),
          text: [bestResult.extractedText, ...rescans.map(({ text }) => text)].join("\n"),
          lines: [...rescans.flatMap(({ lines }) => lines), ...bestResult.lines],
          identifier: bestResult.identifier,
        }, profile);
        if (compareOCRCandidates(rescanned, bestResult) < 0) bestResult = rescanned;
      }
    } else {
      const lines = bestResult.lines;
      const missingRegions = [];
      if (!bestResult.identifier) {
        const index = lines.findIndex(({ text }) => IDENTIFIER_LABEL.test(text) || /[0-9OQDILSB]{4}/i.test(text));
        if (index >= 0) missingRegions.push({ kind: "identifier", line: lines[index], next: lines[index + 1] });
      }
      if (!bestResult.fields.firstName || !bestResult.fields.lastName) {
        const index = lines.findIndex(({ text }) => Object.values(NAME_LABELS).some((pattern) => pattern.test(text)));
        if (index >= 0) missingRegions.push({ kind: "name", line: lines[index], next: lines[index + 1] });
      }
      if (profile.role === "provider" && !bestResult.parsedDateOfBirth) {
        const index = lines.findIndex(({ text }) => DOB_LABEL.test(text));
        if (index >= 0) {
          missingRegions.push({ kind: "dob", line: lines[index], next: lines[index + 1] });
        }
      }

      const rescans = [];
      for (const region of missingRegions) {
        const crop = await cropForField(bestVariant, region.line, region.next);
        if (!crop) continue;
        const modes = region.kind === "identifier"
          ? [OCR_SEGMENTATION_MODES[2], OCR_SEGMENTATION_MODES[3]]
          : [OCR_SEGMENTATION_MODES[2]];
        for (const mode of modes) {
          rescans.push(await recognize(
            worker,
            crop,
            mode,
            region.kind === "identifier" ? "0123456789-" : ""
          ));
        }
      }
      if (rescans.length) {
        const rescanned = evaluateOCRCandidate({
          confidence: Math.max(bestResult.ocrConfidence, ...rescans.map(({ confidence }) => confidence)),
          text: [bestResult.extractedText, ...rescans.map(({ text }) => text)].join("\n"),
          lines: [...rescans.flatMap(({ lines }) => lines), ...bestResult.lines],
          identifier: bestResult.identifier,
        }, profile);
        if (compareOCRCandidates(rescanned, bestResult) < 0) bestResult = rescanned;
      }
    }
  }

  if (bestResult && profile.role === "provider" && !bestResult.dateOfBirthMatched) {
    bestResult.autoVerified = false;
  }

  if (bestResult) {
    bestResult.ocrConfidence = reportedConfidence;
    bestResult.verificationScore = calculateVerificationScore(bestResult, profile.role);
    bestResult.autoVerified = bestResult.identityValid &&
      bestResult.verificationScore >= 85 &&
      bestResult.nameMatchAccuracy >= 85 &&
      (profile.role !== "provider" || bestResult.dateOfBirthMatched) &&
      bestResult.providerAgeEligible;
  }

  return bestResult || evaluateOCRCandidate({ confidence: 0, text: "", lines: [] }, profile);
}

function performOCRVerification(image, profile = {}) {
  const job = ocrJobQueue.then(() => runOCR(image, profile));
  ocrJobQueue = job.then(() => undefined, () => undefined);
  return job;
}

module.exports = {
  HEADER_ANCHORS,
  OCR_LANGUAGES,
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
  performOCRVerification,
  resolveIdentifier,
  selectOCRConfidence,
  shouldUseManualReview(result) {
    return result.identityValid && (
      result.verificationScore >= 70 && result.verificationScore < 85 ||
      result.nameMatchAccuracy >= 70 && result.nameMatchAccuracy < 85 ||
      !result.fields.firstName ||
      !result.fields.lastName ||
      result.role === "provider" && (
        !result.parsedDateOfBirth ||
        !result.dateOfBirthMatched
      )
    );
  },
  warmOCRWorker,
};
