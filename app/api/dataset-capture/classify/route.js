import OpenAI from "openai";
import { NextResponse } from "next/server";
import {
  DATASET_CAPTURE_BUCKET_VALUES,
  isImageUploadFile,
} from "../../../lib/datasetCapture";
import {
  authorizeDatasetCaptureAdmin,
  datasetCaptureAuthFailureResponse,
} from "../../../lib/datasetCaptureAdmin";

export const dynamic = "force-dynamic";

const BUCKET_GUIDE = {
  real_pet_photos: "Natural photos of real pets or animals.",
  phone_screen_photos: "Photos taken of a phone screen showing content.",
  indoor_soft_light: "Indoor scenes with soft or diffuse lighting.",
  screenshots: "Direct device screenshots or screen captures.",
  ai_controls: "Known AI-generated or synthetic control images.",
};

export async function POST(req) {
  try {
    const auth = await authorizeDatasetCaptureAdmin(req);
    if (!auth.ok) {
      return NextResponse.json(datasetCaptureAuthFailureResponse(auth), {
        status: auth.status,
      });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !isImageUploadFile(file)) {
      return NextResponse.json(
        { success: false, error: "A valid image file is required." },
        { status: 400 }
      );
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({
        success: true,
        suggestionAvailable: false,
        suggested_bucket: null,
        note: "OpenAI is not configured. No automatic bucket suggestion was generated.",
      });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const bytes = await file.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const mimeType = file.type || "image/jpeg";

    const bucketDescriptions = DATASET_CAPTURE_BUCKET_VALUES.map(
      (bucket) => `- ${bucket}: ${BUCKET_GUIDE[bucket]}`
    ).join("\n");

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      instructions:
        "You classify private calibration dataset images. Return only JSON. This is a suggestion for human review and must never be treated as ground truth.",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Choose the single best bucket for this image from this exact list:
${bucketDescriptions}

Respond with JSON only:
{"suggested_bucket":"<one bucket id>","confidence":"low|medium|high","reason":"short reason"}`,
            },
            {
              type: "input_image",
              image_url: `data:${mimeType};base64,${base64}`,
              detail: "low",
            },
          ],
        },
      ],
      max_output_tokens: 180,
    });

    let parsed = null;
    try {
      const raw = (response.output_text || "").trim();
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    } catch {
      parsed = null;
    }

    const suggested =
      parsed?.suggested_bucket &&
      DATASET_CAPTURE_BUCKET_VALUES.includes(parsed.suggested_bucket)
        ? parsed.suggested_bucket
        : null;

    return NextResponse.json({
      success: true,
      suggestionAvailable: Boolean(suggested),
      suggested_bucket: suggested,
      confidence: parsed?.confidence || null,
      reason: parsed?.reason || null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Bucket suggestion failed.",
      },
      { status: 500 }
    );
  }
}
