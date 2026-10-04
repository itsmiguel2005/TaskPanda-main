export const MINIMUM_IMAGE_SHARPNESS = 100;

const MAX_ANALYSIS_DIMENSION = 512;

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
    const { data } = context.getImageData(0, 0, width, height);
    const grayscale = new Float32Array(width * height);
    for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
      const offset = pixel * 4;
      grayscale[pixel] =
        0.299 * data[offset] +
        0.587 * data[offset + 1] +
        0.114 * data[offset + 2];
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
    return {
      sharpness,
      isBlurry: sharpness < MINIMUM_IMAGE_SHARPNESS,
    };
  } catch (error) {
    throw new Error("Could not analyze this image. Please try another image.", { cause: error });
  } finally {
    bitmap?.close();
  }
}
