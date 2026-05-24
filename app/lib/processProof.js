import * as exifr from "exifr";

export async function processProof(file, publicUrl) {
  let metadata = {};

  try {
    metadata = await exifr.parse(file);
  } catch (err) {
    console.error("Metadata extraction failed");
  }

  const riskFlags = [];

  if (!metadata?.Make) {
    riskFlags.push("Missing camera manufacturer");
  }

  if (!metadata?.DateTimeOriginal) {
    riskFlags.push("Missing original timestamp");
  }

  const trustScore = Math.max(
    10,
    100 - riskFlags.length * 15
  );

  return {
    metadata,
    riskFlags,
    trustScore,
    summary:
      trustScore > 70
        ? "Likely authentic"
        : "Potential AI or manipulated media",
  };
}
