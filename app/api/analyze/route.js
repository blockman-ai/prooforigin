import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
      riskFlags.push(`Possible AI-generation software detected: ${metadata.Software}`);
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
    const { proofId, fileName, fileType, publicUrl, metadata = {} } =
      await req.json();

    if (!proofId) {
      return NextResponse.json(
        { error: "Missing proofId" },
        { status: 400 }
      );
    }

    const forensic = basicForensicChecks({
      fileName,
      fileType,
      metadata,
    });

    const prompt = `
You are ProofOrigin, an AI authenticity and forensic verification engine.

Analyze this digital file using the structured evidence below.

FILE:
- Name: ${fileName}
- Type: ${fileType}
- Public URL: ${publicUrl}

FORENSIC SIGNALS:
- Trust Score: ${forensic.trustScore}/100
- Trust Rating: ${forensic.trustRating}
- Risk Flags: ${forensic.riskFlags.length ? forensic.riskFlags.join(", ") : "None detected"}

METADATA:
${JSON.stringify(metadata, null, 2)}

Return a professional authenticity report with these sections:

1. Summary
2. Authenticity Assessment
3. AI-Generation Risk
4. Manipulation Risk
5. Metadata Findings
6. Trust Rating
7. Recommended Next Step

Keep it clear, concise, and useful for a public verification page.
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const aiSummary = response.choices[0]?.message?.content || "";

    const { error: updateError } = await supabase
      .from("proofs")
      .update({
        ai_summary: aiSummary,
        status: "analyzed",
        metadata,
      })
      .eq("proof_id", proofId);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      proofId,
      aiSummary,
      forensic,
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
