export const MAX_PHOTO_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_STORED_PHOTO_BYTES = 200 * 1024;
export const MAX_PHOTO_DIMENSION = 512;

function formatMegabytes(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image. Try another file."));
    };
    img.src = url;
  });
}

function scaleDimensions(width, height, maxDimension) {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) {
    return { width, height };
  }
  const ratio = maxDimension / longest;
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function dataUrlByteLength(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}

export async function preparePhotoForLocalStorage(file) {
  if (!file?.type?.startsWith("image/")) {
    throw new Error("Photo must be an image file.");
  }

  if (file.size > MAX_PHOTO_FILE_BYTES) {
    throw new Error(
      `Photo is too large (${formatMegabytes(file.size)} MB). Choose an image under ${formatMegabytes(MAX_PHOTO_FILE_BYTES)} MB.`
    );
  }

  const img = await loadImageFromFile(file);
  const { width, height } = scaleDimensions(
    img.naturalWidth,
    img.naturalHeight,
    MAX_PHOTO_DIMENSION
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not process photo in this browser.");
  }

  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.85;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (dataUrlByteLength(dataUrl) > MAX_STORED_PHOTO_BYTES && quality > 0.4) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  if (dataUrlByteLength(dataUrl) > MAX_STORED_PHOTO_BYTES) {
    throw new Error(
      "Photo is still too large after compression. Try a smaller image or crop it first."
    );
  }

  return dataUrl;
}
