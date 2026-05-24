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

function normalizeExif(exif) {
  return {
    make: exif?.Make || exif?.make || null,
    model: exif?.Model || exif?.model || null,
    software:
      exif?.Software ||
      exif?.CreatorTool ||
      exif?.ProcessingSoftware ||
      null,
    dateTimeOriginal:
      exif?.DateTimeOriginal?.toString?.() ||
      exif?.CreateDate?.toString?.() ||
      exif?.ModifyDate?.toString?.() ||
      null,
    gpsPresent: Boolean(exif?.latitude && exif?.longitude),
    imageWidth: exif?.ImageWidth || null,
    imageHeight: exif?.ImageHeight || null,
  };
}

function getSightengineAiScore(data) {
  return (
    data.type?.ai_generated ??
    data.ai_generated ??
    data.genai?.ai_generated ??
    0
  );
}

function getVerdict(percent) {
  if (percent >= 70) return "Likely AI-generated";
  if (percent <= 30) return "Likely human-made";
  return "Uncertain";
}

function getConsensusScore(scores) {
  const validScores = scores.filter((score) => typeof score === "number");

  if (validScores.length === 0) return 0;

  const total = validScores.reduce((sum, score) => sum + score, 0);

  return Math.round(total / validScores.length);
}

async function runHiveAnalysis(buffer, file) {
  const hiveApiKey = process.env.HIVE_API_KEY;

  if (!hiveApiKey) {
    return {
      success: false,
      error: "Hive API key missing",
      percent: null,
      source: null,
      raw: null,
    };
  }

  try {
    const hiveFile = new File([buffer], file.name || "upload.jpg", {
      type: file.type || "image/jpeg",
    });

    const hiveForm = new FormData();
    hiveForm.append("media", hiveFile);

    const hiveRes = await fetch("https://api.thehive.ai/api/v3/task/sync", {
      method: "POST",
      headers: {
        Authorization: `Token ${hiveApiKey}`,
      },
      body: hiveForm,
    });

    const hiveData = await hiveRes.json();

    if (!hiveRes.ok || hiveData?.status?.[0]?.status === "failure") {
      return {
        success: false,
        error:
          hiveData?.message ||
          hiveData?.error ||
          hiveData?.status?.[0]?.response?.error ||
          "Hive analysis failed",
        percent: null,
        source: null,
        raw: hiveData,
      };
    }

    const output =
      hiveData?.status?.[0]?.response?.output ||
      hiveData?.response?.output ||
      hiveData?.output ||
      [];

    let aiGeneratedScore = null;
    let topSource = null;
    let topSourceScore = 0;

    for (const item of output) {
      const classes = item?.classes || [];

      for (const cls of classes) {
        const className = cls?.class || cls?.label || cls?.name;
        const score = Number(cls?.score ?? cls?.confidence ?? 0);

        if (className === "ai_generated") {
          aiGeneratedScore = score;
        }

        if (
          className &&
          className !== "ai_generated" &&
          className !== "not_ai_generated" &&
          score > topSourceScore
        ) {
          topSource = className;
          topSourceScore = score;
        }
      }
    }

    const percent =
      aiGeneratedScore !== null ? Math.round(aiGeneratedScore * 100) : null;

    return {
      success: true,
      percent,
      source: topSource,
      raw: hiveData,
    };
  } catch (error) {
    return {
      success: false,
      error: error?.message || "Hive analysis failed",
      percent: null,
      source: null,
      raw: null,
    };
  }
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
    const normalizedExif = normalizeExif(exif);

    const metadata = {
      metadataStatus:
        Object.keys(exif).length > 0 ? "Metadata Found" : "Limited Metadata",
      integrityScore,
      fileName: file.name || "unknown",
      fileType: file.type || "unknown",
      fileSize: file.size || buffer.length,
      camera:
        normalizedExif.make || normalizedExif.model
          ? `${normalizedExif.make || ""} ${normalizedExif.model || ""}`.trim()
          : null,
      software: normalizedExif.software,
      dateTaken: normalizedExif.dateTimeOriginal,
      gpsPresent: normalizedExif.gpsPresent,
      exif: normalizedExif,
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

    const sightRes = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: sightForm,
    });

    const sightData = await sightRes.json();

    if (!sightRes.ok || sightData.status === "failure") {
      return NextResponse.json(
        {
          success: false,
          error: sightData.error?.message || "Sightengine analysis failed.",
          raw: sightData,
        },
        { status: 500 }
      );
    }

    const sightengineScore = getSightengineAiScore(sightData);
    const sightenginePercent = Math.round(Number(sightengineScore) * 100);

    const hive = await runHiveAnalysis(buffer, file);

    const percent = getConsensusScore([
      sightenginePercent,
      hive.success ? hive.percent : null,
    ]);

    const verdict = getVerdict(percent);

    return NextResponse.json({
      success: true,
      percent,
      verdict,
      proofOriginScore: integrityScore,
      metadata,
      engines: {
        sightengine: {
          success: true,
          percent: sightenginePercent,
          raw: sightData,
        },
        hive: {
          success: hive.success,
          percent: hive.percent,
          source: hive.source,
          error: hive.error || null,
          raw: hive.raw,
        },
      },
      raw: {
        sightengine: sightData,
        hive: hive.raw,
      },
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
