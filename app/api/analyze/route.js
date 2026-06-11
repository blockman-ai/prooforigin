import { NextResponse } from "next/server";
import { getProofOriginAnalyzeUrl } from "../../lib/prooforiginAiConfig";
import { mapProofOriginProtocol } from "../../lib/prooforiginProtocolMapper";

export const dynamic = "force-dynamic";

const PROXY_UNREACHABLE =
  "Analysis service could not be reached through the website proxy.";

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

    const response = await fetch(getProofOriginAnalyzeUrl(), {
      method: "POST",
      body: apiForm,
    });

    const data = await response.json();

    if (!response.ok || data?.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data?.error || data?.detail || "ProofOrigin AI backend failed",
          raw: data,
        },
        { status: response.ok ? 502 : response.status }
      );
    }

    const protocol = mapProofOriginProtocol(data);

    return NextResponse.json({
      success: true,
      ...protocol,
      public_label: protocol.publicLabel,
      decision_tier: protocol.decisionTier,
      verification_notice: protocol.verificationNotice,
      claim_boundary: protocol.claimBoundary,
      protocol_name: protocol.protocolName,
      protocol_version: protocol.protocolVersion,
      evidence_bundle_hash: protocol.evidenceBundleHash,
      verified_scope: protocol.verifiedScope,
      truth_verified: protocol.truthVerified,
      file_id: protocol.fileId,
      response_meta: data?.response_meta ?? null,
      contract: data?.contract ?? null,
      ai_probability: data?.ai_probability ?? null,
      manipulation_risk: data?.manipulation_risk ?? null,
      confidence: data?.confidence ?? null,
      signal_summary: data?.signal_summary ?? null,
      forensic_notes: data?.forensic_notes ?? null,
      model_sources_used: data?.model_sources_used ?? null,
      evaluation_mode: data?.evaluation_mode ?? null,
      percent:
        data?.ai_probability ??
        protocol.aiProbability ??
        data?.percent ??
        data?.summary?.ai_score ??
        0,
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
      training_status: data?.training_status ?? null,
      engine_outputs: data?.engine_outputs ?? null,
      weighted_consensus: data?.weighted_consensus ?? null,
      forensic_context: data?.forensic_context ?? null,
      engine_arbitration: data?.engine_arbitration ?? null,
      human_summary: data?.human_summary ?? null,
      raw: data,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: PROXY_UNREACHABLE,
      },
      { status: 502 }
    );
  }
}
