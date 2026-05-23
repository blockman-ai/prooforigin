import crypto from "crypto";
import exifr from "exifr";

async function getMetadataForensics(file, buffer) {
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

  const fileName = file.name || "unknown";
  const fileType = file.type || "unknown";
  const fileSize = file.size || buffer.length;
  const lowerName = fileName.toLowerCase();

  const possibleCameraOriginal =
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg");

  const possibleScreenshot =
    lowerName.includes("screenshot") ||
    lowerName.includes("screen") ||
    lowerName.endsWith(".png");

  const possibleEdited =
    lowerName.includes("edited") ||
    lowerName.includes("export") ||
    lowerName.includes("photoshop") ||
    lowerName.includes("canva") ||
    lowerName.includes("goart");

  let metadataStatus = "Limited";
  let integrityScore = 60;

  const metadataSignals = [];
  const exifSignals = [];

  let exif = null;

  try {
    exif = await exifr.parse(buffer);

    if (exif?.Make || exif?.Model) {
      exifSignals.push("Camera make/model metadata detected.");
      integrityScore += 10;
    }

    if (exif?.Software) {
      exifSignals.push(`Software tag detected: ${exif.Software}`);

      integrityScore -= 10;

      if (
        String(exif.Software).toLowerCase().includes("photoshop") ||
        String(exif.Software).toLowerCase().includes("canva") ||
        String(exif.Software).toLowerCase().includes("midjourney")
      ) {
        integrityScore -= 10;
      }
    }

    if (exif?.DateTimeOriginal) {
      exifSignals.push("Original capture timestamp detected.");
      integrityScore += 5;
    }

    if (exif?.latitude || exif?.longitude) {
      exifSignals.push("GPS metadata detected.");
      integrityScore += 5;
    }

    if (!exif) {
      exifSignals.push("No readable EXIF metadata found.");
      integrityScore -= 5;
    }
  } catch {
    exifSignals.push("EXIF metadata could not be parsed.");
    integrityScore -= 5;
  }

  if (possibleCameraOriginal) {
    metadataStatus = "Camera-Compatible";
    integrityScore += 15;

    metadataSignals.push(
      "File format is commonly used by camera-original images."
    );
  }

  if (possibleScreenshot) {
    metadataStatus = "Screenshot-Likely";
    integrityScore -= 20;

    metadataSignals.push(
      "Filename or PNG format suggests this may be a screenshot."
    );
  }

  if (possibleEdited) {
    metadataStatus = "Editing-Likely";
    integrityScore -= 25;

    metadataSignals.push(
      "Filename suggests possible editing or app export."
    );
  }

  if (fileSize < 100000) {
    integrityScore -= 10;

    metadataSignals.push(
      "Small file size may indicate compression or re-export."
    );
  }

  integrityScore = Math.max(0, Math.min(100, integrityScore));

  return {
    fileName,
    fileType,
    fileSize,
    sha256,
    metadataStatus,
    integrityScore,

    possibleCameraOriginal,
    possibleScreenshot,
    possibleEdited,

    metadataSignals,
    exifSignals,

    exif: {
      make: exif?.Make || null,
      model: exif?.Model || null,
      software: exif?.Software || null,
      dateTimeOriginal: exif?.DateTimeOriginal || null,
      gpsPresent: Boolean(exif?.latitude || exif?.longitude),
    },

    timestamp: new Date().toISOString(),
  };
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file) {
      return Response.json(
        { error: "No image uploaded." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const metadata = await getMetadataForensics(file, buffer);

    const apiUser = process.env.SIGHTENGINE_USER;
    const apiSecret = process.env.SIGHTENGINE_SECRET;

    if (!apiUser || !apiSecret) {
      return Response.json(
        { error: "Sightengine credentials are missing." },
        { status: 500 }
      );
    }

    const sightFile = new File(
      [buffer],
      file.name || "upload.jpg",
      {
        type: file.type || "image/jpeg",
      }
    );

    const sightForm = new FormData();

    sightForm.append("media", sightFile);
    sightForm.append("models", "genai");
    sightForm.append("api_user", apiUser);
    sightForm.append("api_secret", apiSecret);

    const res = await fetch(
      "https://api.sightengine.com/1.0/check.json",
      {
        method: "POST",
        body: sightForm,
      }
    );

    const data = await res.json();

    if (!res.ok || data.status === "failure") {
      return Response.json(
        {
          error:
            data.error?.message || "Analysis failed.",
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

    const percent = Math.round(aiScore * 100);

    let verdict = "Uncertain";

    if (percent >= 70) {
      verdict = "Likely AI-generated";
    }

    if (percent <= 30) {
      verdict = "Likely human-made";
    }

    const proofOriginScore = Math.round(
      percent * 0.75 +
      (100 - metadata.integrityScore) * 0.25
    );

    return Response.json({
      percent,
      verdict,
      proofOriginScore,
      metadata,
      raw: data,
    });

  } catch (error) {
    return Response.json(
      {
        error: error.message || "Server error.",
      },
      { status: 500 }
    );
  }
}
