import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PROOFORIGIN_AI_URL =
  "https://prooforigin-ai-production-2983.up.railway.app/analyze";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("image") || formData.get("file");

    if (!file) {
      return NextResponse.json(
        {
          success: false,
          error: "No image uploaded",
        },
        { status: 400 }
      );
    }

    const apiForm = new FormData();
    apiForm.append("file", file);

    const response = await fetch(PROOFORIGIN_AI_URL, {
      method: "POST",
      body: apiForm,
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data?.error || "ProofOrigin AI backend failed",
          raw: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      percent: data?.percent ?? data?.summary?.ai_score ?? 0,
      verdict: data?.verdict ?? data?.summary?.label ?? "Unknown",
      proofOriginScore:
        data?.proofOriginScore ??
        data?.consensus_analysis?.consensus_score ??
        null,
      metadata: data?.metadata ?? null,

      summary: data?.summary ?? null,
      origin_analysis: data?.origin_analysis ?? null,
      consensus_analysis: data?.consensus_analysis ?? null,
      adversarial_analysis: data?.adversarial_analysis ?? null,
      provenance_analysis: data?.provenance_analysis ?? null,
      trace_analysis: data?.trace_analysis ?? null,
      evidence: data?.evidence ?? [],
      warnings: data?.warnings ?? [],

      file_id: data?.file_id ?? null,
      training_status: data?.training_status ?? null,
      raw: data,
    });
  } catch (error) {
    console.error("ProofOrigin analyze proxy error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Analysis failed",
      },
      { status: 500 }
    );
  }
}
