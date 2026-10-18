const sharp = require("sharp");

const MAX_IMAGE_PIXELS = 16_000_000;
const MAX_OUTPUT_DIMENSION = 2400;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function hasImageSignature(buffer) {
  return (
    (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    (buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP")
  );
}

async function rasterizeSinglePagePdf(buffer) {
  const [{ getDocument }, canvasModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ]);
  const { createCanvas, DOMMatrix, ImageData, Path2D } = canvasModule;
  globalThis.DOMMatrix ||= DOMMatrix;
  globalThis.ImageData ||= ImageData;
  globalThis.Path2D ||= Path2D;

  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const pdf = await loadingTask.promise;
  try {
    if (pdf.numPages !== 1) {
      const error = new Error("Upload a single-page PDF of your PhilSys ID.");
      error.statusCode = 400;
      throw error;
    }
    const page = await pdf.getPage(1);
    const naturalViewport = page.getViewport({ scale: 1 });
    const scale = Math.min(3, MAX_OUTPUT_DIMENSION / Math.max(naturalViewport.width, naturalViewport.height));
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({
      canvas,
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } finally {
    await loadingTask.destroy();
  }
}

function calculateImageQuality(pixels, width, height, channels) {
  const sampleStep = Math.max(1, Math.floor(Math.max(width, height) / 512));
  const grayscale = new Float32Array(Math.ceil(width / sampleStep) * Math.ceil(height / sampleStep));
  const sampledWidth = Math.ceil(width / sampleStep);
  const sampledHeight = Math.ceil(height / sampleStep);
  let luminanceTotal = 0;
  let index = 0;
  for (let y = 0; y < height; y += sampleStep) {
    for (let x = 0; x < width; x += sampleStep) {
      const offset = (y * width + x) * channels;
      const luminance = channels === 1
        ? pixels[offset]
        : 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
      grayscale[index] = luminance;
      luminanceTotal += luminance;
      index += 1;
    }
  }

  let squaredLaplacianTotal = 0;
  let count = 0;
  for (let y = 1; y < sampledHeight - 1; y += 1) {
    for (let x = 1; x < sampledWidth - 1; x += 1) {
      const pixelIndex = y * sampledWidth + x;
      const laplacian = grayscale[pixelIndex - 1] +
        grayscale[pixelIndex + 1] +
        grayscale[pixelIndex - sampledWidth] +
        grayscale[pixelIndex + sampledWidth] -
        4 * grayscale[pixelIndex];
      squaredLaplacianTotal += laplacian * laplacian;
      count += 1;
    }
  }

  const averageLuminance = luminanceTotal / grayscale.length;
  const sharpness = count ? squaredLaplacianTotal / count : 0;
  return {
    averageLuminance,
    sharpness,
    isTooDark: averageLuminance < 38,
    isBlurry: sharpness < 100,
  };
}

async function prepareVerificationDocument(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    const error = new Error("Choose a valid PhilSys ID image or single-page PDF.");
    error.statusCode = 400;
    throw error;
  }
  const normalizedMimeType = String(mimeType || "").toLowerCase();
  const isPdf = buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!isPdf && (!ACCEPTED_IMAGE_TYPES.has(normalizedMimeType) || !hasImageSignature(buffer))) {
    const error = new Error("Choose a JPEG, PNG, WebP, or single-page PDF of your PhilSys ID.");
    error.statusCode = 400;
    throw error;
  }
  if (isPdf && normalizedMimeType !== "application/pdf") {
    const error = new Error("Choose a JPEG, PNG, WebP, or single-page PDF of your PhilSys ID.");
    error.statusCode = 400;
    throw error;
  }

  const source = isPdf ? await rasterizeSinglePagePdf(buffer) : buffer;
  const oriented = sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS, failOn: "warning" }).rotate();
  const metadata = await oriented.metadata();
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > MAX_IMAGE_PIXELS) {
    const error = new Error("This ID image is too large to process. Please choose a smaller photo.");
    error.statusCode = 413;
    throw error;
  }
  const { data, info } = await oriented
    .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const quality = calculateImageQuality(data, info.width, info.height, info.channels);
  const normalized = await sharp(source, { limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize({
      width: MAX_OUTPUT_DIMENSION,
      height: MAX_OUTPUT_DIMENSION,
      fit: "inside",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  return { buffer: normalized, format: "png", quality, isPdf };
}

module.exports = {
  calculateImageQuality,
  hasImageSignature,
  prepareVerificationDocument,
  rasterizeSinglePagePdf,
};
