/** Client-side asset photo preparation: resize, compress, data URL for registration. */

export const IMAGE_INPUT_MAX_DATA_URL_LENGTH = 700_000;
export const IMAGE_INPUT_MAX_LONG_EDGE = 1600;
export const IMAGE_INPUT_MIN_LONG_EDGE = 640;
export const IMAGE_INPUT_MIN_QUALITY = 0.52;
export const IMAGE_INPUT_QUALITY_STEP = 0.08;
export const IMAGE_INPUT_INITIAL_QUALITY = 0.88;

export const SUPPORTED_ASSET_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const HEIC_ASSET_IMAGE_PATTERN = /\.(heic|heif)$/i;

export function isHeicAssetImage(file) {
  const name = String(file?.name || "").toLowerCase();
  const type = String(file?.type || "").toLowerCase();
  return HEIC_ASSET_IMAGE_PATTERN.test(name) || type === "image/heic" || type === "image/heif";
}

export function isSupportedAssetImageType(file) {
  if (!file) return false;
  if (isHeicAssetImage(file)) return false;
  const type = String(file.type || "").toLowerCase();
  if (SUPPORTED_ASSET_IMAGE_TYPES.has(type)) return true;
  // Some mobile browsers omit MIME type; allow common extensions.
  const name = String(file.name || "").toLowerCase();
  return /\.(jpe?g|png|webp)$/.test(name);
}

export function describeUnsupportedAssetImage(file) {
  if (isHeicAssetImage(file)) {
    return "iPhone HEIC/HEIF photos are not supported yet. Save as JPG or export as PNG/WebP and try again.";
  }
  return "Use a JPG, PNG, or WebP photo for your asset.";
}

export function computeScaledDimensions(width, height, maxLongEdge) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const longEdge = Math.max(safeWidth, safeHeight);
  if (longEdge <= maxLongEdge) {
    return { width: safeWidth, height: safeHeight };
  }
  const scale = maxLongEdge / longEdge;
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to decode image."));
    image.src = dataUrl;
  });
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Unable to encode image."));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality
    );
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read encoded image."));
    reader.readAsDataURL(blob);
  });
}

async function canvasSupportsMimeType(mimeType) {
  if (typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 2;
  const blob = await canvasToBlob(canvas, mimeType, 0.82).catch(() => null);
  return Boolean(blob && blob.type === mimeType);
}

async function outputMimeTypesForSource(sourceType) {
  if (sourceType === "image/png") {
    return ["image/png"];
  }
  const types = [];
  if (await canvasSupportsMimeType("image/webp")) {
    types.push("image/webp");
  }
  types.push("image/jpeg");
  return types;
}

async function encodeCanvasUnderLimit(canvas, mimeTypes, maxDataUrlLength) {
  let lastError = null;

  for (const mimeType of mimeTypes) {
    let quality = IMAGE_INPUT_INITIAL_QUALITY;
    while (quality >= IMAGE_INPUT_MIN_QUALITY) {
      try {
        const blob = await canvasToBlob(canvas, mimeType, quality);
        const dataUrl = await blobToDataUrl(blob);
        if (dataUrl.length <= maxDataUrlLength) {
          return {
            dataUrl,
            mimeType,
            quality,
            byteLength: blob.size,
            dataUrlLength: dataUrl.length,
          };
        }
        lastError = new Error("Encoded image is still too large.");
      } catch (error) {
        lastError = error;
      }
      quality = Number((quality - IMAGE_INPUT_QUALITY_STEP).toFixed(2));
    }
  }

  throw lastError || new Error("Unable to compress image enough for upload.");
}

function drawImageToCanvas(image, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Unable to prepare image canvas.");
  }
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/**
 * Resize and compress a user-selected photo for asset registration.
 * Returns a data URL sized for server validation while preserving aspect ratio.
 */
export async function prepareAssetImageFromFile(
  file,
  {
    maxLongEdge = IMAGE_INPUT_MAX_LONG_EDGE,
    maxDataUrlLength = IMAGE_INPUT_MAX_DATA_URL_LENGTH,
  } = {}
) {
  if (!isSupportedAssetImageType(file)) {
    throw new Error(describeUnsupportedAssetImage(file));
  }

  const sourceDataUrl = await readFileAsDataUrl(file);
  const image = await loadImageElement(sourceDataUrl);
  const mimeTypes = await outputMimeTypesForSource(file.type);

  let targetLongEdge = maxLongEdge;
  let lastError = null;

  while (targetLongEdge >= IMAGE_INPUT_MIN_LONG_EDGE) {
    const { width, height } = computeScaledDimensions(
      image.naturalWidth,
      image.naturalHeight,
      targetLongEdge
    );

    try {
      const canvas = drawImageToCanvas(image, width, height);
      const encoded = await encodeCanvasUnderLimit(canvas, mimeTypes, maxDataUrlLength);
      return {
        dataUrl: encoded.dataUrl,
        mimeType: encoded.mimeType,
        width,
        height,
        quality: encoded.quality,
        originalSize: file.size,
        processedSize: encoded.byteLength,
        dataUrlLength: encoded.dataUrlLength,
      };
    } catch (error) {
      lastError = error;
      targetLongEdge = Math.round(targetLongEdge * 0.78);
    }
  }

  throw lastError || new Error("Unable to prepare this photo. Try a different JPG, PNG, or WebP file.");
}
