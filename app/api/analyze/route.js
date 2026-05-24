import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function getSupabaseServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

function basicForensicChecks({ fileName, fileType, metadata }) {
  const riskFlags = [];
  let trustScore = 100;

  if (!metadata || Object.keys(metadata).length === 0) {
    riskFlags.push("No readable metadata found");
    trustScore -= 20;
  }

  if (fileType?.startsWith("image/")) {
    if (!metadata?.Make && !metadata?.Model) {
      riskFlags.push("Missing camera make/model");
      trustScore -= 15;
    }

    if (!metadata?.DateTimeOriginal && !metadata?.CreateDate) {
      riskFlags.push("Missing original capture timestamp");
      trustScore -= 15;
    }

    const software = String(metadata?.Software || "").toLowerCase();

    if (
      software.includes("photoshop") ||
      software.includes("lightroom") ||
      software.includes("gimp") ||
      software.includes("canva")
    ) {
      riskFlags.push(`Edited/exported with ${metadata.Software}`);
      trustScore -= 20;
    }

    if (
      software.includes("midjourney") ||
      software.includes("stable diffusion") ||
      software.includes("dall") ||
      software.includes("firefly")
    ) {
      riskFlags.push(
        `Possible AI-generation software detected: ${metadata.Software}`
      );
      trustScore -= 35;
    }
  }

  if (fileName && /\.(ai|psd)$/i.test(fileName)) {
    riskFlags.push("Source/design file format detected");
    trustScore -= 10;
  }

  trustScore = Math.max(0, Math.min(100, trustScore));

  let trustRating = "High";
  if (trustScore < 75) trustRating = "Medium";
  if (trustScore < 45) trustRating = "Low";

  return {
    riskFlags,
    trustScore,
    trustRating,
  };
}

export async function POST(req) {
  try {
    const body = await req.json();

    const proofId = body.proofId || null;
    const fileName = body.fileName || "Uploaded file";
    const fileType = body.fileType || "image/png";
    const publicUrl = body.publicUrl || body.imageUrl || "";
    const metadata = body.metadata || {};

    if (!publicUrl && !proofId) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing file URL or proof ID",
        },
        { status: 400 }
      );
    }

    const forensic = basicForensicChecks({
      fileName,
      fileType,
      metadata,
    });

    const prompt = `
You are ProofOrigin, an AI authenticity verification engine.

Analyze this uploaded digital file.

FILE DETAILS:
- File Name: ${fileName}
- File Type: ${fileType}
- Public URL: ${publicUrl}

FORENSIC ANALYSIS:
- Trust Score: ${forensic.trustScore}/100
- Trust Rating: ${forensic.trustRating}
- Risk Flags: ${forensic.riskFlags.join(", ") || "None"}

METADATA:
${JSON.stringify(metadata, null, 2)}

Return a clear authenticity report with:
1. Summary
2. Authenticity Assessment
3. AI Generation Risk
4. Manipulation Risk
5. Metadata Findings
6. Trust Rating
7. Recommended Next Step
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const aiSummary = response.choices?.[0]?.message?.content || "";

    if (proofId) {
      const supabase = getSupabaseServerClient();

      const { error: updateError } = await supabase
        .from("proofs")
        .update({
          ai_summary: aiSummary,
          status: "analyzed",
          metadata,
        })
        .eq("proof_id", proofId);

      if (updateError) throw updateError;
    }

    return NextResponse.json({
      success: true,
      proofId,
      aiScore: 100 - forensic.trustScore,
      verdict:
        forensic.trustScore >= 75
          ? "Likely Authentic"
          : forensic.trustScore >= 45
          ? "Uncertain / Needs Review"
          : "Possible AI or Manipulated",
      forensic,
      aiSummary,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Analysis failed",
      },
      { status: 500 }
    );
  }
}
