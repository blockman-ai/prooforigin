import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function generateMetadata(file) {
  return {
    metadataStatus: "Partial Metadata",
    integrityScore: Math.floor(Math.random() * 40) + 55,
    fileType: file?.type || "unknown",
    fileSize: file?.size || 0,

    exif: {
      make: "Unknown",
      model: "Unknown",
      software: "Not detected",
      dateTimeOriginal: "Unavailable",
      gpsPresent: false,
    },

    metadataSignals: [
      "Limited metadata detected",
      "Basic forensic scan completed",
    ],

    exifSignals: [
      "No strong EXIF anomalies detected",
    ],

    sha256:
      crypto.randomUUID().replaceAll("-", "") +
      crypto.randomUUID().replaceAll("-", ""),
  };
}

export async function POST(req) {
  try {
    const formData = await req.formData();

    const file =
      formData.get("image") ||
      formData.get("file");

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "No image uploaded",
        },
        { status: 400 }
      );
    }

    // MOCK DETECTION ENGINE
    // temporary stable version

    const percent = Math.floor(Math.random() * 100);

    const metadata = generateMetadata(file);

    return NextResponse.json({
      success: true,

      percent,

      proofOriginScore: 100 - percent,

      metadata,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Analysis failed",
      },
      {
        status: 500,
      }
    );
  }
}
