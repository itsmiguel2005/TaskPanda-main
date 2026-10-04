export const MINIMUM_IMAGE_SHARPNESS = 100;

const MAX_ANALYSIS_DIMENSION = 512;
const MINIMUM_IMAGE_EDGE = 360;
const RECOMMENDED_IMAGE_EDGE = 640;

export function analyzeImageQuality(imageData, width, height) {
  const { data } = imageData;
  const grayscale = new Float32Array(width * height);
  let luminanceTotal = 0;
  let brightPixelCount = 0;
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    const luminance =
      0.299 * data[offset] +
      0.587 * data[offset + 1] +
      0.114 * data[offset + 2];
    grayscale[pixel] = luminance;
    luminanceTotal += luminance;
    if (luminance >= 248) brightPixelCount += 1;
  }

  let sum = 0;
  let squaredSum = 0;
  let sampleCount = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      const laplacian =
        grayscale[index - 1] +
        grayscale[index + 1] +
        grayscale[index - width] +
        grayscale[index + width] -
        4 * grayscale[index];
      sum += laplacian;
      squaredSum += laplacian * laplacian;
      sampleCount += 1;
    }
  }

  const mean = sum / sampleCount;
  const sharpness = squaredSum / sampleCount - mean * mean;
  const pixelCount = grayscale.length;
  const averageLuminance = luminanceTotal / pixelCount;
  const brightPixelRatio = brightPixelCount / pixelCount;

  return {
    sharpness,
    averageLuminance,
    isBlurry: sharpness < MINIMUM_IMAGE_SHARPNESS,
    isTooDark: averageLuminance < 38,
    isOverexposed: averageLuminance > 232 || brightPixelRatio > 0.35,
  };
}

export async function checkImageSharpness(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_ANALYSIS_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(3, Math.round(bitmap.width * scale));
    const height = Math.max(3, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      throw new Error("Canvas image analysis is unavailable.");
    }

    context.drawImage(bitmap, 0, 0, width, height);
    const quality = analyzeImageQuality(
      context.getImageData(0, 0, width, height),
      width,
      height
    );
    const imageEdge = Math.min(bitmap.width, bitmap.height);
    return {
      ...quality,
      isTooSmall: imageEdge < MINIMUM_IMAGE_EDGE,
      isLowResolution: imageEdge < RECOMMENDED_IMAGE_EDGE,
    };
  } catch (error) {
    throw new Error("Could not analyze this image. Please try another image.", { cause: error });
  } finally {
    bitmap?.close();
  }
}
