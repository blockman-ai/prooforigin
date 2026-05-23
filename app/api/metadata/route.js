import crypto from "crypto";

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image");

    if (!file) {
      return Response.json({ error: "No image uploaded." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

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
    const signals = [];

    if (possibleCameraOriginal) {
      metadataStatus = "Camera-Compatible";
      integrityScore += 15;
      signals.push("File format is commonly used by camera-original images.");
    }

    if (possibleScreenshot) {
      metadataStatus = "Screenshot-Likely";
      integrityScore -= 20;
      signals.push("Filename or PNG format suggests this may be a screenshot.");
    }

    if (possibleEdited) {
      metadataStatus = "Editing-Likely";
      integrityScore -= 25;
      signals.push("Filename suggests possible editing or app export.");
    }

    if (fileSize < 100000) {
      integrityScore -= 10;
      signals.push("Small file size may indicate compression or re-export.");
    }

    integrityScore = Math.max(0, Math.min(100, integrityScore));

    return Response.json({
      fileName,
      fileType,
      fileSize,
      sha256,
      metadataStatus,
      integrityScore,
      possibleCameraOriginal,
      possibleScreenshot,
      possibleEdited,
      signals,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { error: error.message || "Metadata analysis failed." },
      { status: 500 }
    );
  }
}
