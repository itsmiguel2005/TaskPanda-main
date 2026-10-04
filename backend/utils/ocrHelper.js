const Tesseract = require("tesseract.js");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

let workerPromise;
const ocrCachePath = path.join(os.tmpdir(), "taskpanda-tesseract");
const OCR_LANGUAGES = "eng+fil";
const OCR_SEGMENTATION_MODES = [
  Tesseract.PSM.SINGLE_BLOCK,
  Tesseract.PSM.SPARSE_TEXT,
];
const IGNORED_NAME_PARTS = new Set([
  "da",
  "das",
  "de",
  "del",
  "di",
  "do",
  "dos",
  "la",
  "las",
  "los",
  "ng",
  "sa",
  "van",
  "von",
]);
const ID_TYPE_SIGNATURES = [
  { pattern: /\bphilsys\b/i, type: "PhilSys National ID" },
  { pattern: /\b(?:lto|land\s+transportation\s+office|driver'?s?\s+licen[sc]e)\b/i, type: "Driver's License" },
  { pattern: /\bumid\b/i, type: "UMID" },
  { pattern: /\b(?:philpost|postal\s+id)\b/i, type: "Postal ID" },
  { pattern: /\bcomelec\b/i, type: "Voter's ID" },
  { pattern: /\bpassport\b/i, type: "Passport" },
];
const UNKNOWN_ID_TYPE = "Unknown";
const MINIMUM_NAME_MATCH_ACCURACY = 0.75;
const BACK_SIDE_SIGNATURES = [
  /\bsignature\b/i,
  /\b(?:thumb\s?mark|thumbprint|fingerprint|left\s+thumb|right\s+thumb)\b/i,
  /\b(?:emergency\s+contact|in\s+case\s+of\s+emergency)\b/i,
];

function normalizeWords(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0 && !IGNORED_NAME_PARTS.has(word));
}

function detectIdType(extractedText) {
  const signature = ID_TYPE_SIGNATURES.find(({ pattern }) => pattern.test(String(extractedText || "")));
  return signature?.type || UNKNOWN_ID_TYPE;
}

function classifyIdSide({ extractedText, ocrConfidence, nameMatch, detectedIdType }) {
  const text = String(extractedText || "");
  const matchingBackSignatures = BACK_SIDE_SIGNATURES.map((pattern) => pattern.test(text));
  const hasCoreNameMatch = Boolean(nameMatch?.firstNameMatched && nameMatch?.lastNameMatched);
  const hasRecognizedIdType = Boolean(detectedIdType && detectedIdType !== UNKNOWN_ID_TYPE);

  if (
    Number(ocrConfidence) >= 50 &&
    matchingBackSignatures[1] &&
    (matchingBackSignatures[0] || matchingBackSignatures[2]) &&
    !hasCoreNameMatch &&
    !hasRecognizedIdType
  ) {
    return "back";
  }

  if (
    (Number(ocrConfidence) >= 60 && hasCoreNameMatch) ||
    hasFrontFaceEvidence({
    ocrConfidence,
    nameMatchAccuracy: nameMatch?.accuracy === undefined
      ? undefined
      : Number(nameMatch.accuracy) * 100,
    firstNameMatched: nameMatch?.firstNameMatched,
    lastNameMatched: nameMatch?.lastNameMatched,
    detectedIdType,
    extractedText: text,
    })
  ) {
    return "front";
  }

  return "uncertain";
}

function hasConfidentCoreNameMatch(ocrResult) {
  return Number(ocrResult?.ocrConfidence) >= 60 &&
    Number(ocrResult?.nameMatchAccuracy) >= 75 &&
    ocrResult?.firstNameMatched === true &&
    ocrResult?.lastNameMatched === true;
}

function hasFrontFaceEvidence(ocrResult) {
  const text = String(ocrResult?.extractedText || "");
  const hasIdentityHeading = detectIdType(text) !== UNKNOWN_ID_TYPE;
  const personalFieldMatches = text.match(
    /\b(?:surname|given\s+names?|middle\s+name|date\s+of\s+birth|birth\s+date|sex|nationality|address|license\s+no)\b/gi
  ) || [];
  return Number(ocrResult?.ocrConfidence) >= 40 &&
    hasIdentityHeading &&
    (hasConfidentCoreNameMatch(ocrResult) || personalFieldMatches.length >= 2);
}

function areIdSidesLikelySwapped(frontOCRResult, backOCRResult) {
  return !hasConfidentCoreNameMatch(frontOCRResult) &&
    hasConfidentCoreNameMatch(backOCRResult) ||
    !hasFrontFaceEvidence(frontOCRResult) &&
      hasFrontFaceEvidence(backOCRResult);
}

function editDistance(left, right, maximumDistance) {
  if (Math.abs(left.length - right.length) > maximumDistance) return Infinity;

  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + cost
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maximumDistance) return Infinity;
    previous = current;
  }
  return previous[right.length];
}

function getNameTokenQuality(profileWord, extractedWords, allowSingleOCRTypo) {
  if (extractedWords.includes(profileWord)) return 1;
  if (!allowSingleOCRTypo || profileWord.length < 5) return 0;
  const maximumDistance = Math.min(2, Math.max(1, Math.floor(profileWord.length * 0.2)));
  const bestDistance = extractedWords.reduce((best, word) => {
    if (word.length < 5) return best;
    return Math.min(best, editDistance(profileWord, word, maximumDistance));
  }, Infinity);
  return Number.isFinite(bestDistance)
    ? Math.max(0.65, 1 - bestDistance / profileWord.length)
    : 0;
}

function scoreNameMatch(extractedText, userName, { allowSingleOCRTypo = false } = {}) {
  const profileWords = [...new Set(normalizeWords(userName))];
  const extractedWords = [...new Set(normalizeWords(extractedText))];
  if (profileWords.length < 2 || !extractedWords.length) {
    return {
      accuracy: 0,
      matchedParts: 0,
      totalParts: profileWords.length,
      firstNameMatched: false,
      lastNameMatched: false,
    };
  }

  const extractedWordSet = new Set(extractedWords);
  const firstName = profileWords[0];
  const lastName = profileWords[profileWords.length - 1];
  const middleNames = profileWords.slice(1, -1);
  const firstNameMatched = extractedWordSet.has(firstName);
  const lastNameMatched = extractedWordSet.has(lastName);
  const firstNameQuality = getNameTokenQuality(firstName, extractedWords, allowSingleOCRTypo);
  const lastNameQuality = getNameTokenQuality(lastName, extractedWords, allowSingleOCRTypo);
  const middleNameQualities = middleNames.map((middleName) =>
    getNameTokenQuality(middleName, extractedWords, allowSingleOCRTypo)
  );
  const matchedMiddleNames = middleNameQualities.filter((quality) => quality === 1).length;
  const coreWeight = middleNames.length ? 0.75 : 1;
  const matchedParts = Number(firstNameMatched) + Number(lastNameMatched) + matchedMiddleNames;
  const accuracy = middleNames.length
    ? ((firstNameQuality + lastNameQuality) / 2) * coreWeight +
      (middleNameQualities.reduce((total, quality) => total + quality, 0) / middleNames.length) * (1 - coreWeight)
    : (firstNameQuality + lastNameQuality) / 2;

  return {
    accuracy,
    matchedParts,
    totalParts: profileWords.length,
    firstNameMatched,
    lastNameMatched,
  };
}

function scoreLtoNameMatch(extractedText, userName) {
  return scoreNameMatch(extractedText, userName, { allowSingleOCRTypo: true });
}

function shouldAutoVerify(ocrConfidence, nameMatch) {
  return ocrConfidence >= 60 &&
    nameMatch.accuracy >= MINIMUM_NAME_MATCH_ACCURACY &&
    nameMatch.totalParts >= 2 &&
    nameMatch.firstNameMatched &&
    nameMatch.lastNameMatched;
}

async function createIdOCRVariants(image) {
  const imageBuffer = Buffer.isBuffer(image) ? image : await fs.readFile(image);
  const metadata = await sharp(imageBuffer).rotate().metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Could not read ID image dimensions.");
  }

  const orientationSwapsDimensions = metadata.orientation >= 5 && metadata.orientation <= 8;
  const imageWidth = orientationSwapsDimensions ? metadata.height : metadata.width;
  const imageHeight = orientationSwapsDimensions ? metadata.width : metadata.height;
  const cropWidth = Math.max(1, Math.round(imageWidth * 0.94));
  const cropHeight = Math.max(1, Math.round(imageHeight * 0.5));
  const [cardCrop, resizedFullImage] = await Promise.all([
    sharp(imageBuffer)
      .rotate()
      .extract({
        left: Math.max(0, Math.round((imageWidth - cropWidth) / 2)),
        top: Math.max(0, Math.round((imageHeight - cropHeight) / 2)),
        width: Math.min(cropWidth, imageWidth),
        height: Math.min(cropHeight, imageHeight),
      })
      .resize({ width: 1800, withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .jpeg({ quality: 90 })
      .toBuffer(),
    sharp(imageBuffer)
      .rotate()
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .grayscale()
      .jpeg({ quality: 85 })
      .toBuffer(),
  ]);

  return [cardCrop, resizedFullImage];
}

function selectBestOCRCandidate(candidates, userName) {
  const combinedText = candidates.map((candidate) => candidate.text).join("\n");
  const detectedIdType = detectIdType(combinedText);
  const combinedNameMatch = detectedIdType === "Driver's License"
    ? scoreLtoNameMatch(combinedText, userName)
    : null;
  return candidates
    .map((candidate) => {
      const confidence = Math.max(0, Math.min(100, Number(candidate.confidence) || 0));
      const candidateIdType = detectIdType(candidate.text);
      const nameMatch = combinedNameMatch
        ? combinedNameMatch
        : scoreNameMatch(candidate.text, userName);
      return {
        confidence,
        nameMatch,
        detectedIdType: candidateIdType === UNKNOWN_ID_TYPE ? detectedIdType : candidateIdType,
        text: combinedNameMatch ? combinedText : candidate.text,
      };
    })
    .sort((left, right) =>
      Number(right.nameMatch.firstNameMatched && right.nameMatch.lastNameMatched) -
        Number(left.nameMatch.firstNameMatched && left.nameMatch.lastNameMatched) ||
      right.nameMatch.accuracy - left.nameMatch.accuracy ||
      Number(right.detectedIdType !== UNKNOWN_ID_TYPE) - Number(left.detectedIdType !== UNKNOWN_ID_TYPE) ||
      right.confidence - left.confidence
    )[0] || null;
}

function formatOCRResult(candidate) {
  const { confidence, nameMatch, detectedIdType } = candidate;
  return {
    ocrConfidence: confidence,
    detectedIdType,
    extractedText: candidate.text,
    nameMatchAccuracy: Math.round(nameMatch.accuracy * 100),
    matchedNameParts: nameMatch.matchedParts,
    totalNameParts: nameMatch.totalParts,
    firstNameMatched: nameMatch.firstNameMatched,
    lastNameMatched: nameMatch.lastNameMatched,
    autoVerified: shouldAutoVerify(confidence, nameMatch),
  };
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await fs.mkdir(ocrCachePath, { recursive: true });
      return Tesseract.createWorker(
        OCR_LANGUAGES,
        Tesseract.OEM.LSTM_ONLY,
        { cachePath: ocrCachePath, legacyCore: true }
      );
    })();
  }
  try {
    return await workerPromise;
  } catch (error) {
    workerPromise = null;
    throw error;
  }
}

async function performOCRVerification(imagePath, userName) {
  try {
    const worker = await getWorker();
    const candidates = [];
    const modeErrors = [];
    const imageVariants = await createIdOCRVariants(imagePath);
    for (const imageVariant of imageVariants) {
      for (const mode of OCR_SEGMENTATION_MODES) {
        try {
          await worker.setParameters({ tessedit_pageseg_mode: mode });
          const { data } = await worker.recognize(imageVariant);
          candidates.push({ confidence: data.confidence, text: data.text });
          const currentBest = selectBestOCRCandidate(candidates, userName);
          if (currentBest.nameMatch.accuracy === 1) {
            return formatOCRResult(currentBest);
          }
        } catch (error) {
          modeErrors.push(error);
        }
      }
    }

    if (!candidates.length) {
      throw new Error(`All OCR image variants and layout modes failed: ${modeErrors.map((error) => error.message).join("; ")}`);
    }
    if (modeErrors.length) {
      console.warn(`Verification OCR: ${modeErrors.length} of ${imageVariants.length * OCR_SEGMENTATION_MODES.length} image/layout attempts failed.`);
    }

    const bestCandidate = selectBestOCRCandidate(candidates, userName);
    return formatOCRResult(bestCandidate);
  } catch (error) {
    console.warn("Verification OCR failed; routing submission for manual review:", error.message);
    return {
      ocrConfidence: 0,
      detectedIdType: UNKNOWN_ID_TYPE,
      extractedText: "",
      nameMatchAccuracy: 0,
      matchedNameParts: 0,
      totalNameParts: normalizeWords(userName).length,
      firstNameMatched: false,
      lastNameMatched: false,
      autoVerified: false,
      ocrUnavailable: true,
    };
  }
}

module.exports = {
  OCR_LANGUAGES,
  OCR_SEGMENTATION_MODES,
  areIdSidesLikelySwapped,
  classifyIdSide,
  createIdOCRVariants,
  detectIdType,
  performOCRVerification,
  scoreLtoNameMatch,
  scoreNameMatch,
  selectBestOCRCandidate,
  shouldAutoVerify,
};
