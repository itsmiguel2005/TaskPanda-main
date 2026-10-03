const Tesseract = require("tesseract.js");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

let workerPromise;
const ocrCachePath = path.join(os.tmpdir(), "taskpanda-tesseract");
const OCR_LANGUAGES = "eng+fil";
const OCR_SEGMENTATION_MODES = [
  Tesseract.PSM.AUTO_OSD,
  Tesseract.PSM.AUTO,
  Tesseract.PSM.SINGLE_BLOCK,
  Tesseract.PSM.SPARSE_TEXT,
];
const OCR_ORIENTATION_LANGUAGE = "osd";

function normalizeWords(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 1);
}

function scoreNameMatch(extractedText, userName) {
  const profileWords = [...new Set(normalizeWords(userName))];
  const extractedWords = [...new Set(normalizeWords(extractedText))];
  if (!profileWords.length || !extractedWords.length) {
    return { accuracy: 0, matchedParts: 0, totalParts: profileWords.length };
  }

  const extractedWordSet = new Set(extractedWords);
  const matchedParts = profileWords.filter((profileWord) => extractedWordSet.has(profileWord)).length;

  return {
    accuracy: matchedParts / profileWords.length,
    matchedParts,
    totalParts: profileWords.length,
  };
}

function shouldAutoVerify(ocrConfidence, nameMatchAccuracy, totalNameParts) {
  return ocrConfidence >= 60 && nameMatchAccuracy === 1 && totalNameParts >= 2;
}

function selectBestOCRCandidate(candidates, userName) {
  return candidates
    .map((candidate) => {
      const confidence = Math.max(0, Math.min(100, Number(candidate.confidence) || 0));
      const nameMatch = scoreNameMatch(candidate.text, userName);
      return { confidence, nameMatch };
    })
    .sort((left, right) =>
      right.nameMatch.matchedParts - left.nameMatch.matchedParts ||
      right.confidence - left.confidence
    )[0] || null;
}

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      await fs.mkdir(ocrCachePath, { recursive: true });
      const orientationModelPath = path.join(ocrCachePath, `${OCR_ORIENTATION_LANGUAGE}.traineddata`);
      let orientationModel;
      try {
        orientationModel = await fs.readFile(orientationModelPath);
      } catch (error) {
        if (error.code !== "ENOENT") {
          throw error;
        }

        const orientationWorker = await Tesseract.createWorker(
          OCR_ORIENTATION_LANGUAGE,
          Tesseract.OEM.TESSERACT_ONLY,
          { cachePath: ocrCachePath, legacyCore: true, legacyLang: true }
        );
        try {
          orientationModel = await fs.readFile(orientationModelPath);
        } finally {
          await orientationWorker.terminate();
        }
      }

      const worker = await Tesseract.createWorker(
        OCR_LANGUAGES,
        Tesseract.OEM.LSTM_ONLY,
        { cachePath: ocrCachePath, legacyCore: true }
      );
      try {
        await worker.FS("writeFile", [`./${OCR_ORIENTATION_LANGUAGE}.traineddata`, orientationModel]);
        return worker;
      } catch (error) {
        await worker.terminate();
        throw error;
      }
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
    for (const mode of OCR_SEGMENTATION_MODES) {
      try {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(imagePath, { rotateAuto: true });
        candidates.push({ confidence: data.confidence, text: data.text });
      } catch (error) {
        modeErrors.push(error);
      }
    }

    if (!candidates.length) {
      throw new Error(`All OCR layout modes failed: ${modeErrors.map((error) => error.message).join("; ")}`);
    }
    if (modeErrors.length) {
      console.warn(`Verification OCR: ${modeErrors.length} of ${OCR_SEGMENTATION_MODES.length} layout modes failed.`);
    }

    const bestCandidate = selectBestOCRCandidate(candidates, userName);
    const { confidence, nameMatch } = bestCandidate;

    return {
      ocrConfidence: confidence,
      nameMatchAccuracy: Math.round(nameMatch.accuracy * 100),
      matchedNameParts: nameMatch.matchedParts,
      totalNameParts: nameMatch.totalParts,
      autoVerified: shouldAutoVerify(confidence, nameMatch.accuracy, nameMatch.totalParts),
    };
  } catch (error) {
    console.warn("Verification OCR failed; routing submission for manual review:", error.message);
    return {
      ocrConfidence: 0,
      nameMatchAccuracy: 0,
      matchedNameParts: 0,
      totalNameParts: normalizeWords(userName).length,
      autoVerified: false,
      ocrUnavailable: true,
    };
  }
}

module.exports = {
  OCR_LANGUAGES,
  OCR_ORIENTATION_LANGUAGE,
  OCR_SEGMENTATION_MODES,
  performOCRVerification,
  scoreNameMatch,
  selectBestOCRCandidate,
  shouldAutoVerify,
};
