const Tesseract = require("tesseract.js");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const sharp = require("sharp");

let workerPromise;
let ocrJobQueue = Promise.resolve();
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
const MAX_OCR_IMAGE_VARIANTS = 8;
const OCR_IMAGE_MAX_SIZE = 1800;
const OCR_IMAGE_ROTATIONS = [0, 90, 180];
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

function getProfileNameParts(userName) {
  if (userName && typeof userName === "object") {
    return {
      firstName: normalizeWords(userName.firstName),
      middleName: normalizeWords(userName.middleName),
      lastName: normalizeWords(userName.lastName),
    };
  }

  const words = normalizeWords(userName);
  return {
    firstName: words.length ? [words[0]] : [],
    middleName: words.slice(1, -1),
    lastName: words.length > 1 ? [words[words.length - 1]] : [],
  };
}

function scoreNameParts(extractedText, nameParts, { allowSingleOCRTypo = false } = {}) {
  const extractedWords = [...new Set(normalizeWords(extractedText))];
  const extractedWordSet = new Set(extractedWords);
  const { firstName, middleName, lastName } = nameParts;
  const totalParts = firstName.length + middleName.length + lastName.length;

  if (firstName.length === 0 || lastName.length === 0 || extractedWords.length === 0) {
    return {
      accuracy: 0,
      matchedParts: 0,
      totalParts,
      firstNameMatched: false,
      lastNameMatched: false,
    };
  }

  const scoreField = (parts) => {
    if (!parts.length) return { quality: 0, exactMatches: 0, matched: false };
    const qualities = parts.map((part) => getNameTokenQuality(part, extractedWords, allowSingleOCRTypo));
    const exactMatches = parts.filter((part) => extractedWordSet.has(part)).length;
    return {
      quality: qualities.reduce((total, quality) => total + quality, 0) / parts.length,
      exactMatches,
      matched: exactMatches === parts.length,
    };
  };

  const first = scoreField(firstName);
  const middle = scoreField(middleName);
  const last = scoreField(lastName);
  const hasMiddleName = middleName.length > 0;
  const accuracy = hasMiddleName
    ? ((first.quality + last.quality) / 2) * 0.75 + middle.quality * 0.25
    : (first.quality + last.quality) / 2;

  return {
    accuracy,
    matchedParts: first.exactMatches + middle.exactMatches + last.exactMatches,
    totalParts,
    firstNameMatched: first.matched,
    lastNameMatched: last.matched,
  };
}

function scoreNameMatch(extractedText, userName, { allowSingleOCRTypo = false } = {}) {
  return scoreNameParts(extractedText, getProfileNameParts(userName), { allowSingleOCRTypo });
}

function scoreLtoNameMatch(extractedText, userName) {
  return scoreNameMatch(extractedText, userName, { allowSingleOCRTypo: true });
}

function getCandidateLineRecords(candidate) {
  if (Array.isArray(candidate.lines) && candidate.lines.length) {
    return candidate.lines
      .map((line) => typeof line === "string" ? { text: line } : line)
      .filter((line) => typeof line?.text === "string" && line.text.trim());
  }
  return String(candidate.text || "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((text) => ({ text }));
}

function findNameFieldLabels(text) {
  const pattern = /\b(gitnang\s+(?:pangalan|apelyido)|middle\s+names?|surname|family\s+name|last\s+name|apelyido(?:\s+ng\s+pamilya)?|given\s+names?|first\s+name|forenames?|mga\s+pangalan|pangalan)\b/gi;
  return [...text.matchAll(pattern)].map((match) => ({
    text: match[0],
    index: match.index,
    end: match.index + match[0].length,
    field: /^(?:surname|family\s+name|last\s+name|apelyido(?:\s+ng\s+pamilya)?)$/i.test(match[0])
      ? "lastName"
      : /^(?:middle\s+names?|gitnang\s+(?:pangalan|apelyido))$/i.test(match[0])
        ? "middleName"
        : "firstName",
  }));
}

function getNameLabelCenter(line, label) {
  const words = Array.isArray(line.words) ? line.words : [];
  const labelWords = normalizeWords(label.text);
  for (let start = 0; start <= words.length - labelWords.length; start += 1) {
    const matchedWords = words.slice(start, start + labelWords.length);
    const normalizedLabelWords = matchedWords.flatMap((word) => normalizeWords(word.text));
    if (normalizedLabelWords.join(" ") !== labelWords.join(" ")) continue;
    const boxes = matchedWords.map((word) => word.bbox).filter((bbox) =>
      Number.isFinite(bbox?.x0) && Number.isFinite(bbox?.x1)
    );
    if (!boxes.length) return null;
    return (Math.min(...boxes.map((bbox) => bbox.x0)) + Math.max(...boxes.map((bbox) => bbox.x1))) / 2;
  }
  return null;
}

function readColumnValues(labelLine, valueLine, labels) {
  const columns = labels
    .map((label) => ({ ...label, center: getNameLabelCenter(labelLine, label) }))
    .filter(({ center }) => center !== null)
    .sort((left, right) => left.center - right.center);
  if (columns.length < 2 || !Array.isArray(valueLine.words)) return [];

  const values = columns.map((column, index) => {
    const lowerBound = index === 0 ? -Infinity : (columns[index - 1].center + column.center) / 2;
    const upperBound = index === columns.length - 1 ? Infinity : (column.center + columns[index + 1].center) / 2;
    const text = valueLine.words
      .filter((word) => {
        const center = (word.bbox?.x0 + word.bbox?.x1) / 2;
        return Number.isFinite(center) && center > lowerBound && center <= upperBound;
      })
      .map((word) => word.text)
      .join(" ")
      .trim();
    return { field: column.field, text };
  });
  return values;
}

function extractLabeledNameFields(lineRecords) {
  const fields = {};
  let foundLabel = false;

  for (let index = 0; index < lineRecords.length; index += 1) {
    const line = lineRecords[index];
    const labels = findNameFieldLabels(line.text);
    if (!labels.length) continue;
    foundLabel = true;

    if (labels.length > 1) {
      labels.forEach((label, labelIndex) => {
        const nextLabel = labels[labelIndex + 1];
        const inlineValue = line.text.slice(label.end, nextLabel?.index).replace(/^[\s:,-]+|[\s:,-]+$/g, "");
        if (inlineValue) fields[label.field] = [fields[label.field], inlineValue].filter(Boolean).join(" ");
      });

      const missingLabels = labels.filter((label) => !fields[label.field]);
      if (missingLabels.length) {
        const valueLine = lineRecords.slice(index + 1).find((candidate) =>
          candidate.text.trim() && !findNameFieldLabels(candidate.text).length
        );
        if (valueLine) {
          for (const value of readColumnValues(line, valueLine, missingLabels)) {
            if (value.text) fields[value.field] = [fields[value.field], value.text].filter(Boolean).join(" ");
          }
        }
      }
      continue;
    }

    const label = labels[0];
    const value = line.text.slice(label.end).replace(/^[\s:,-]+|[\s:,-]+$/g, "");
    let fieldValue = value;
    if (!fieldValue) {
      const nextLine = lineRecords[index + 1];
      if (nextLine?.text.trim() && !findNameFieldLabels(nextLine.text).length) fieldValue = nextLine.text.trim();
    }
    if (fieldValue) fields[label.field] = [fields[label.field], fieldValue].filter(Boolean).join(" ");
  }

  return { fields, foundLabel };
}

function scoreLabeledNameFields(fields, profileName, options) {
  const profileParts = getProfileNameParts(profileName);
  const scoreField = (field, expectedParts) => {
    if (!expectedParts.length || !fields[field]) return { quality: 0, matchedParts: 0, matched: false };
    const observedParts = normalizeWords(fields[field]);
    const observedSet = new Set(observedParts);
    const qualities = expectedParts.map((part) => getNameTokenQuality(part, observedParts, options.allowSingleOCRTypo));
    const matchedParts = expectedParts.filter((part) => observedSet.has(part)).length;
    return {
      quality: qualities.reduce((total, quality) => total + quality, 0) / expectedParts.length,
      matchedParts,
      matched: matchedParts === expectedParts.length,
    };
  };

  const first = scoreField("firstName", profileParts.firstName);
  const middle = scoreField("middleName", profileParts.middleName);
  const last = scoreField("lastName", profileParts.lastName);
  const hasMiddleName = profileParts.middleName.length > 0;
  const accuracy = hasMiddleName
    ? ((first.quality + last.quality) / 2) * 0.75 + middle.quality * 0.25
    : (first.quality + last.quality) / 2;

  return {
    accuracy,
    matchedParts: first.matchedParts + middle.matchedParts + last.matchedParts,
    totalParts: profileParts.firstName.length + profileParts.middleName.length + profileParts.lastName.length,
    firstNameMatched: first.matched,
    lastNameMatched: last.matched,
  };
}

function scoreLtoCommaSeparatedName(line, userName) {
  const commaIndex = line.indexOf(",");
  if (commaIndex < 0) return null;

  const match = scoreLabeledNameFields({
    lastName: line.slice(0, commaIndex),
    firstName: line.slice(commaIndex + 1),
    middleName: line.slice(commaIndex + 1),
  }, userName, { allowSingleOCRTypo: true });
  return match.firstNameMatched && match.lastNameMatched ? match : null;
}

function scoreCandidateName(candidate, userName, allowSingleOCRTypo = false) {
  const lineRecords = getCandidateLineRecords(candidate);
  const lines = lineRecords.map(({ text }) => ({
    text: allowSingleOCRTypo
      ? text.replace(/^\s*(?:(?:republic\s+of\s+the\s+philippines)\s+)?(?:(?:lto|land\s+transportation\s+office)\s+)?driver'?s?\s+licen[sc]e\b[\s:,-]*/i, "")
      : text,
  }));
  if (allowSingleOCRTypo) {
    const ltoMatches = lines
      .map(({ text }) => scoreLtoCommaSeparatedName(text, userName))
      .filter(Boolean);
    const bestLtoMatch = ltoMatches.sort((left, right) => right.accuracy - left.accuracy)[0];
    if (bestLtoMatch?.accuracy === 1) return bestLtoMatch;
  }
  const { fields, foundLabel } = extractLabeledNameFields(lineRecords);
  if (foundLabel) {
    const labeledMatch = scoreLabeledNameFields(fields, userName, { allowSingleOCRTypo });
    if (labeledMatch.accuracy === 1) return labeledMatch;
  }

  const profileParts = getProfileNameParts(userName);
  const maxWindowSize = Math.max(1, profileParts.firstName.length + profileParts.middleName.length + profileParts.lastName.length + 2);
  const expectedNameParts = [
    ...profileParts.firstName,
    ...profileParts.middleName,
    ...profileParts.lastName,
  ];
  const completeNameWindowSize = Math.min(lines.length, Math.max(1, Math.min(expectedNameParts.length + 2, 6)));
  for (let start = 0; start < lines.length; start += 1) {
    for (let size = 1; size <= completeNameWindowSize && start + size <= lines.length; size += 1) {
      const match = scoreNameMatch(
        lines.slice(start, start + size).map(({ text }) => text).join(" "),
        userName,
        { allowSingleOCRTypo }
      );
      if (match.accuracy === 1 && match.matchedParts === match.totalParts) return match;
    }
  }

  const isNameOnlyLine = (line) => {
    const words = normalizeWords(line);
    return words.length > 0 && words.every((word) =>
      expectedNameParts.some((part) =>
        getNameTokenQuality(part, [word], allowSingleOCRTypo) > 0
      )
    );
  };
  let bestMatch = scoreNameMatch("", userName, { allowSingleOCRTypo });
  for (let start = 0; start < lines.length; start += 1) {
    for (let size = 1; size <= maxWindowSize && start + size <= lines.length; size += 1) {
      const lineWindow = lines.slice(start, start + size);
      const isLtoNameLine = allowSingleOCRTypo && lineWindow.length === 1;
      if (!isLtoNameLine && !lineWindow.every(({ text }) => isNameOnlyLine(text))) continue;
      const match = scoreNameMatch(lineWindow.map(({ text }) => text).join(" "), userName, { allowSingleOCRTypo });
      if (isLtoNameLine) {
        const lineWords = normalizeWords(lineWindow[0].text);
        const hasCoreNameEvidence = ["firstName", "lastName"].every((field) =>
          profileParts[field].length > 0 &&
          profileParts[field].every((part) =>
            getNameTokenQuality(part, lineWords, allowSingleOCRTypo) > 0
          )
        );
        if (!hasCoreNameEvidence) continue;
      }
      if (
        Number(match.firstNameMatched) + Number(match.lastNameMatched) >
          Number(bestMatch.firstNameMatched) + Number(bestMatch.lastNameMatched) ||
        (match.firstNameMatched === bestMatch.firstNameMatched &&
          match.lastNameMatched === bestMatch.lastNameMatched &&
          match.accuracy > bestMatch.accuracy)
      ) {
        bestMatch = match;
      }
    }
  }

  if (!foundLabel) return bestMatch;
  const labeledMatch = scoreLabeledNameFields(fields, userName, { allowSingleOCRTypo });
  return labeledMatch.accuracy > bestMatch.accuracy ? labeledMatch : bestMatch;
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
  let orientedImage = imageBuffer;
  let metadata;
  try {
    orientedImage = await sharp(imageBuffer).rotate().toBuffer();
    metadata = await sharp(orientedImage).metadata();
  } catch (error) {
    console.warn("Verification OCR preprocessing could not orient the image; trying the original:", error.message);
    return [imageBuffer];
  }
  if (!metadata.width || !metadata.height) {
    console.warn("Verification OCR preprocessing could not read image dimensions; trying the original.");
    return [imageBuffer];
  }

  const imageWidth = metadata.width;
  const imageHeight = metadata.height;
  const variants = [];
  for (const rotation of OCR_IMAGE_ROTATIONS) {
    if (variants.length >= MAX_OCR_IMAGE_VARIANTS - 1) break;
    const isCardinalRotation = [0, 90, 180, 270].includes(rotation);
    let rotatedImage;
    try {
      rotatedImage = await sharp(orientedImage)
        .rotate(rotation, { background: "#ffffff" })
        .resize({
          width: OCR_IMAGE_MAX_SIZE,
          height: OCR_IMAGE_MAX_SIZE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 95 })
        .toBuffer();
    } catch (error) {
      console.warn(`Verification OCR preprocessing failed for ${rotation}-degree rotation; trying other variants:`, error.message);
      continue;
    }

    const initialVariantCount = variants.length;
    const imageAdjustments = [
      {
        name: "normalization",
        process: () => sharp(rotatedImage).grayscale().normalize().sharpen().jpeg({ quality: 92 }).toBuffer(),
      },
      ...(rotation === 0 ? [{
        name: "contrast",
        process: () => sharp(rotatedImage).grayscale().linear(1.15, -15).sharpen().jpeg({ quality: 92 }).toBuffer(),
      }] : []),
    ];
    for (const adjustment of imageAdjustments) {
      if (variants.length >= MAX_OCR_IMAGE_VARIANTS - 1) break;
      try {
        variants.push(await adjustment.process());
      } catch (error) {
        console.warn(`Verification OCR ${adjustment.name} preprocessing failed for ${rotation}-degree image:`, error.message);
      }
    }
    if (variants.length === initialVariantCount) variants.push(rotatedImage);
    if (!isCardinalRotation || variants.length >= MAX_OCR_IMAGE_VARIANTS - 1) continue;

    const rotationSwapsDimensions = rotation === 90 || rotation === 270;
    const rotatedWidth = rotationSwapsDimensions ? imageHeight : imageWidth;
    const rotatedHeight = rotationSwapsDimensions ? imageWidth : imageHeight;
    const rotatedMetadata = await sharp(rotatedImage).metadata();
    const cropWidth = Math.max(1, Math.round(rotatedMetadata.width * 0.94));
    const cropHeight = Math.max(1, Math.round(rotatedMetadata.height * 0.58));
    try {
      const cropBuffer = await sharp(rotatedImage)
        .extract({
          left: Math.max(0, Math.round((rotatedMetadata.width - cropWidth) / 2)),
          top: Math.max(0, Math.round((rotatedMetadata.height - cropHeight) / 2)),
          width: cropWidth,
          height: cropHeight,
        })
        .grayscale()
        .normalize()
        .sharpen()
        .resize({
          width: OCR_IMAGE_MAX_SIZE,
          height: OCR_IMAGE_MAX_SIZE,
          fit: "inside",
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      variants.push(cropBuffer);
    } catch (error) {
      console.warn(`Verification OCR card-area crop failed for ${rotation}-degree image:`, error.message);
    }

    if (rotatedHeight > rotatedWidth && variants.length < MAX_OCR_IMAGE_VARIANTS - 1) {
      const tightCropHeight = Math.max(1, Math.round(rotatedMetadata.height * 0.36));
      try {
        const tightCrop = await sharp(rotatedImage)
          .extract({
            left: Math.max(0, Math.round((rotatedMetadata.width - cropWidth) / 2)),
            top: Math.max(0, Math.round((rotatedMetadata.height - tightCropHeight) / 2)),
            width: cropWidth,
            height: tightCropHeight,
          })
          .grayscale()
          .normalize()
          .sharpen()
          .resize({
            width: OCR_IMAGE_MAX_SIZE,
            height: OCR_IMAGE_MAX_SIZE,
            fit: "inside",
          })
          .jpeg({ quality: 95 })
          .toBuffer();
        variants.push(tightCrop);
      } catch (error) {
        console.warn(`Verification OCR focused card crop failed for ${rotation}-degree image:`, error.message);
      }
    }
  }

  variants.push(imageBuffer);
  return variants;
}

function selectBestOCRCandidate(candidates, userName) {
  const groups = new Map();
  candidates.forEach((candidate, index) => {
    const groupKey = candidate.variantIndex ?? "untracked";
    const group = groups.get(groupKey) || [];
    group.push({ candidate, index });
    groups.set(groupKey, group);
  });

  const bestCandidates = [...groups.values()].flatMap((group) => {
    const combinedText = group.map(({ candidate }) => candidate.text).join("\n");
    const combinedLineRecords = group.flatMap(({ candidate }) => getCandidateLineRecords(candidate));
    const detectedIdType = detectIdType(combinedText);
    const combinedCandidate = { text: combinedText, lines: combinedLineRecords };
    const hasLabeledNameFields = extractLabeledNameFields(combinedLineRecords).foundLabel;
    const combinedNameMatch = detectedIdType === "Driver's License" || hasLabeledNameFields
      ? scoreCandidateName(combinedCandidate, userName, detectedIdType === "Driver's License")
      : null;

    return group.map(({ candidate, index }) => {
      const confidence = Math.max(0, Math.min(100, Number(candidate.confidence) || 0));
      const candidateIdType = detectIdType(candidate.text);
      const nameMatch = combinedNameMatch || scoreCandidateName(candidate, userName);
      return {
        confidence,
        nameMatch,
        detectedIdType: candidateIdType === UNKNOWN_ID_TYPE ? detectedIdType : candidateIdType,
        text: combinedNameMatch ? combinedText : candidate.text,
        variantIndex: candidate.variantIndex,
        index,
      };
    });
  });

  return bestCandidates
    .sort((left, right) =>
      Number(right.nameMatch.firstNameMatched && right.nameMatch.lastNameMatched) -
        Number(left.nameMatch.firstNameMatched && left.nameMatch.lastNameMatched) ||
      right.nameMatch.accuracy - left.nameMatch.accuracy ||
      Number(right.detectedIdType !== UNKNOWN_ID_TYPE) - Number(left.detectedIdType !== UNKNOWN_ID_TYPE) ||
      right.confidence - left.confidence ||
      left.index - right.index
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

async function performOCRVerificationNow(imagePath, userName) {
  try {
    const worker = await getWorker();
    const candidates = [];
    const modeErrors = [];
    const imageVariants = await createIdOCRVariants(imagePath);
    const variantsToProcess = imageVariants.slice(0, MAX_OCR_IMAGE_VARIANTS);
    const recognizeCandidate = async (variantIndex, imageVariant, mode) => {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(imageVariant, {}, { text: true, blocks: true });
        const recognizedLines = Array.isArray(data.lines)
          ? data.lines
          : Array.isArray(data.blocks)
            ? data.blocks.flatMap((block) =>
              (block.paragraphs || []).flatMap((paragraph) => paragraph.lines || [])
            )
            : [];
        candidates.push({
          confidence: data.confidence,
          text: data.text,
          variantIndex,
          lines: recognizedLines.length
            ? recognizedLines.map(({ text, bbox, words }) => ({
              text,
              bbox,
              words: Array.isArray(words)
                ? words.map(({ text: wordText, bbox: wordBbox }) => ({ text: wordText, bbox: wordBbox }))
                : undefined,
            }))
            : undefined,
        });
        const currentBest = selectBestOCRCandidate(candidates, userName);
        if (
          shouldAutoVerify(currentBest.confidence, currentBest.nameMatch) ||
          (currentBest.nameMatch.accuracy === 1 && currentBest.confidence >= 40)
        ) {
          return formatOCRResult(currentBest);
        }
        return null;
      } catch (error) {
        modeErrors.push(error);
        return null;
      }
    };

    for (const [variantIndex, imageVariant] of variantsToProcess.entries()) {
      const completeMatch = await recognizeCandidate(
        variantIndex,
        imageVariant,
        OCR_SEGMENTATION_MODES[0]
      );
      if (completeMatch) return completeMatch;
    }

    const alternateModeVariantIndexes = [0, 1, 3].filter((index) => index < variantsToProcess.length);
    for (const variantIndex of alternateModeVariantIndexes) {
      const completeMatch = await recognizeCandidate(
        variantIndex,
        variantsToProcess[variantIndex],
        OCR_SEGMENTATION_MODES[1]
      );
      if (completeMatch) return completeMatch;
    }

    if (!candidates.length) {
      throw new Error(`All OCR image variants and layout modes failed: ${modeErrors.map((error) => error.message).join("; ")}`);
    }
    if (modeErrors.length) {
      console.warn(`Verification OCR: ${modeErrors.length} of ${variantsToProcess.length + alternateModeVariantIndexes.length} image/layout attempts failed.`);
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
      totalNameParts: Object.values(getProfileNameParts(userName)).flat().length,
      firstNameMatched: false,
      lastNameMatched: false,
      autoVerified: false,
      ocrUnavailable: true,
    };
  }
}

function performOCRVerification(imagePath, userName) {
  const job = ocrJobQueue.then(() => performOCRVerificationNow(imagePath, userName));
  ocrJobQueue = job.then(() => undefined, () => undefined);
  return job;
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
