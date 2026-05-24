import { NextResponse } from "next/server";
import * as exifr from "exifr";
import crypto from "crypto";

export const dynamic = "force-dynamic";

async function getSha256(fileBuffer) {
  return crypto.createHash("sha256").update(fileBuffer).digest("hex");
}

function buildMetadataSignals(exif) {
  const signals = [];

  if (!exif || Object.keys(exif).length === 0) {
    signals.push("No embedded EXIF metadata found");
  } else {
    signals.push("Embedded metadata detected");
  }

  if (!exif?.Make && !exif?.Model) {
    signals.push("Camera make/model not detected");
  }

  if (!exif?.DateTimeOriginal && !exif?.CreateDate) {
    signals.push("Original capture date not detected");
  }

  if (exif?.Software) {
    signals.push(`Software metadata detected: ${exif.Software}`);
  }

  return signals;
}

function buildExifSignals(exif) {
  const signals = [];

  if (!exif || Object.keys(exif).length === 0) {
    signals.push("EXIF metadata unavailable or stripped");
    return signals;
  }

  if (exif?.Software) {
    signals.push(`Possible editing/export software: ${exif.Software}`);
  }

  if (exif?.Make || exif?.Model) {
    signals.push("Camera/device metadata present");
  }

  if (exif?.DateTimeOriginal || exif?.CreateDate) {
    signals.push("Capture timestamp metadata present");
  }

  if (exif?.latitude && exif?.longitude) {
    signals.push("GPS metadata present");
  } else {
    signals.push("GPS metadata not present");
  }

  return signals;
}

function calculateIntegrityScore(exif) {
  let score = 100;

  if (!exif || Object.keys(exif).length === 0) score -= 40;
  if (!exif?.Make && !exif?.Model) score -= 15;
  if (!exif?.DateTimeOriginal && !exif?.CreateDate) score -= 15;
  if (exif?.Software) score -= 10;

  return Math.max(0, Math.min(100, score));
}

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") || formData.get("file");

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No image uploaded" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let exif = {};

    try {
      exif = (await exifr.parse(buffer)) || {};
    } catch {
      exif = {};
    }

    const sha256 = await getSha256(buffer);
    const integrityScore = calculateIntegrityScore(exif);

    const metadata = {
      metadataStatus:
        Object.keys(exif).length > 0 ? "Metadata Found" : "Limited Metadata",
      integrityScore,
      fileType: file.type || "unknown",
      fileSize: file.size || 0,
      exif: {
        make: exif?.Make || null,
        model: exif?.Model || null,
        software: exif?.Software || null,
        dateTimeOriginal:
          exif?.DateTimeOriginal?.toString?.() ||
          exif?.CreateDate?.toString?.() ||
          null,
        gpsPresent: Boolean(exif?.latitude && exif?.longitude),
      },
      metadataSignals: buildMetadataSignals(exif),
      exifSignals: buildExifSignals(exif),
      sha256,
    };

    let percent = 50;

const softwareText = String(exif?.Software || "").toLowerCase();
const allExifText = JSON.stringify(exif).toLowerCase();

if (
  softwareText.includes("midjourney") ||
  softwareText.includes("stable diffusion") ||
  softwareText.includes("dall") ||
  softwareText.includes("firefly") ||
  allExifText.includes("ai generated") ||
  allExifText.includes("prompt") ||
  allExifText.includes("openai") ||
  allExifText.includes("chatgpt")
) {
  percent = 95;
} else if (!exif || Object.keys(exif).length === 0) {
  percent = 70;
} else if (!exif?.Make && !exif?.Model && !exif?.DateTimeOriginal) {
  percent = 65;
} else if (softwareText.includes("photoshop") || softwareText.includes("canva")) {
  percent = 55;
} else {
  percent = 25;
}

    return NextResponse.json({
      success: true,
      percent,
      proofOriginScore: integrityScore,
      metadata,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Analysis failed",
      },
      { status: 500 }
    );
  }
}
