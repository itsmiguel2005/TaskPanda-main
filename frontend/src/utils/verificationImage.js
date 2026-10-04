const MAX_VERIFICATION_IMAGE_BYTES = 1_700_000;
const MAX_VERIFICATION_IMAGE_DIMENSION = 2560;
const MIN_VERIFICATION_IMAGE_DIMENSION = 1200;
const JPEG_QUALITIES = [0.9, 0.84, 0.78, 0.72];

function getExifSegment(jpegBytes) {
  if (jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 4 < jpegBytes.length && jpegBytes[offset] === 0xff) {
    const marker = jpegBytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;

    const segmentLength = (jpegBytes[offset + 2] << 8) | jpegBytes[offset + 3];
    const segmentEnd = offset + 2 + segmentLength;
    if (segmentLength < 2 || segmentEnd > jpegBytes.length) break;

    if (
      marker === 0xe1 &&
      jpegBytes[offset + 4] === 0x45 &&
      jpegBytes[offset + 5] === 0x78 &&
      jpegBytes[offset + 6] === 0x69 &&
      jpegBytes[offset + 7] === 0x66 &&
      jpegBytes[offset + 8] === 0 &&
      jpegBytes[offset + 9] === 0
    ) {
      const segment = jpegBytes.slice(offset, segmentEnd);
      normalizeExifOrientation(segment);
      return segment;
    }

    offset = segmentEnd;
  }
  return null;
}

function normalizeExifOrientation(segment) {
  const tiffOffset = 10;
  const littleEndian = segment[tiffOffset] === 0x49 && segment[tiffOffset + 1] === 0x49;
  const bigEndian = segment[tiffOffset] === 0x4d && segment[tiffOffset + 1] === 0x4d;
  if (!littleEndian && !bigEndian) return;

  const read16 = (offset) => littleEndian
    ? segment[offset] | (segment[offset + 1] << 8)
    : (segment[offset] << 8) | segment[offset + 1];
  const read32 = (offset) => littleEndian
    ? (segment[offset] | (segment[offset + 1] << 8) | (segment[offset + 2] << 16) | (segment[offset + 3] << 24)) >>> 0
    : ((segment[offset] << 24) | (segment[offset + 1] << 16) | (segment[offset + 2] << 8) | segment[offset + 3]) >>> 0;
  const ifdOffset = tiffOffset + read32(tiffOffset + 4);
  if (ifdOffset + 2 > segment.length) return;

  const entryCount = read16(ifdOffset);
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > segment.length) return;
    if (read16(entryOffset) !== 0x0112) continue;
    if (read16(entryOffset + 2) !== 3 || read32(entryOffset + 4) !== 1) return;

    if (littleEndian) {
      segment[entryOffset + 8] = 1;
      segment[entryOffset + 9] = 0;
    } else {
      segment[entryOffset + 8] = 0;
      segment[entryOffset + 9] = 1;
    }
    return;
  }
}

function addExifSegment(jpegBytes, exifSegment) {
  if (!exifSegment || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) return jpegBytes;
  const result = new Uint8Array(jpegBytes.length + exifSegment.length);
  result.set(jpegBytes.subarray(0, 2), 0);
  result.set(exifSegment, 2);
  result.set(jpegBytes.subarray(2), 2 + exifSegment.length);
  return result;
}

function canvasToJpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Your browser could not prepare this image. Please choose another photo."));
      }
    }, "image/jpeg", quality);
  });
}

export async function prepareVerificationImage(file) {
  if (file.size <= MAX_VERIFICATION_IMAGE_BYTES) return file;

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let longestDimension = Math.min(
      MAX_VERIFICATION_IMAGE_DIMENSION,
      Math.max(bitmap.width, bitmap.height)
    );
    const exifSegment = file.type === "image/jpeg"
      ? getExifSegment(new Uint8Array(await file.arrayBuffer()))
      : null;

    while (longestDimension > 0) {
      const scale = Math.min(1, longestDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Your browser cannot prepare this image. Please try another browser.");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of JPEG_QUALITIES) {
        const blob = await canvasToJpegBlob(canvas, quality);
        if (blob.size > MAX_VERIFICATION_IMAGE_BYTES) continue;

        const jpegBytes = new Uint8Array(await blob.arrayBuffer());
        const preparedBytes = addExifSegment(jpegBytes, exifSegment);
        if (preparedBytes.length > MAX_VERIFICATION_IMAGE_BYTES) continue;
        const preparedBlob = new Blob([preparedBytes], { type: "image/jpeg" });
        const fileName = file.name.replace(/\.[^.]+$/, "") || "id-photo";
        return new File([preparedBlob], `${fileName}.jpg`, {
          type: "image/jpeg",
          lastModified: file.lastModified,
        });
      }
      if (longestDimension <= MIN_VERIFICATION_IMAGE_DIMENSION) break;
      longestDimension = Math.max(
        MIN_VERIFICATION_IMAGE_DIMENSION,
        Math.floor(longestDimension * 0.85)
      );
    }
  } catch (error) {
    if (error instanceof Error && /could not prepare|cannot prepare/.test(error.message)) throw error;
    throw new Error("Could not prepare this photo for upload. Please choose another image or retake it.", { cause: error });
  } finally {
    bitmap?.close();
  }

  throw new Error("This photo is too large to upload safely. Please retake it from closer to the ID or choose a smaller image.");
}
