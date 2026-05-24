import { NextResponse } from "next/server";
import * as exifr from "exifr";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function getSha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildMetadataSignals(exif) {
  const signals = [];

  if (!exif || Object.keys(exif).length === 0) {
    signals.push("No embedded EXIF metadata found");
    return signals;
  }

  signals.push("Embedded metadata detected");

  if (exif?.Make || exif?.Model) {
    signals.push("Camera/device metadata present");
  } else {
    signals.push("Camera make/model not detected");
  }

  if (exif?.DateTimeOriginal || exif?.CreateDate) {
    signals.push("Original capture timestamp detected");
  } else {
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

  if (exif?.Make || exif?.Model) {
    signals.push("Camera make/model metadata detected.");
  }

  if (exif?.Software) {
    signals.push(`Software tag detected: ${exif.Software}`);
  }

  if (exif?.DateTimeOriginal || exif?.CreateDate) {
    signals.push("Original capture timestamp detected.");
  }

  if (exif?.latitude && exif?.longitude) {
    signals.push("GPS metadata present.");
  } else {
    signals.push("GPS metadata not present.");
  }

  return signals;
}

function calculateIntegrityScore(exif) {
  let score = 60;

  if (exif && Object.keys(exif).length > 0) score += 10;
  if (exif?.Make || exif?.Model) score += 15;
  if (exif?.DateTimeOriginal || exif?.CreateDate) score += 15;
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

    const apiUser = process.env.SIGHTENGINE_USER;
    const apiSecret = process.env.SIGHTENGINE_SECRET;

    if (!apiUser || !apiSecret) {
      return NextResponse.json(
        { success: false, error: "Sightengine credentials are missing." },
        { status: 500 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let exif = {};
    try {
  exif =
    (await exifr.parse(buffer, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      xmp: true,
      icc: true,
      iptc: true,
    })) || {};
} catch {
  exif = {};
    }

    const sha256 = getSha256(buffer);
    const integrityScore = calculateIntegrityScore(exif);

    const metadata = {
      metadataStatus:
        Object.keys(exif).length > 0 ? "Metadata Found" : "Limited Metadata",
      integrityScore,
      fileName: file.name || "unknown",
      fileType: file.type || "unknown",
      fileSize: file.size || buffer.length,
      camera:
        exif?.Make || exif?.Model
          ? `${exif?.Make || ""} ${exif?.Model || ""}`.trim()
          : null,
      software: exif?.Software || null,
      dateTaken:
        exif?.DateTimeOriginal?.toString?.() ||
        exif?.CreateDate?.toString?.() ||
        null,
      gpsPresent: Boolean(exif?.latitude && exif?.longitude),
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
      timestamp: new Date().toISOString(),
    };

    const sightFile = new File([buffer], file.name || "upload.jpg", {
      type: file.type || "image/jpeg",
    });

    const sightForm = new FormData();
    sightForm.append("media", sightFile);
    sightForm.append("models", "genai");
    sightForm.append("api_user", apiUser);
    sightForm.append("api_secret", apiSecret);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: sightForm,
    });

    const data = await res.json();

    if (!res.ok || data.status === "failure") {
      return NextResponse.json(
        {
          success: false,
          error: data.error?.message || "Sightengine analysis failed.",
          raw: data,
        },
        { status: 500 }
      );
    }

    const aiScore =
      data.type?.ai_generated ??
      data.ai_generated ??
      data.genai?.ai_generated ??
      0;

    const percent = Math.round(Number(aiScore) * 100);

    let verdict = "Uncertain";
    if (percent >= 70) verdict = "Likely AI-generated";
    if (percent <= 30) verdict = "Likely human-made";

    return NextResponse.json({
      success: true,
      percent,
      verdict,
      proofOriginScore: integrityScore,
      metadata,
      raw: data,
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
