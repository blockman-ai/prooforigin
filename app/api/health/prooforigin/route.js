import { NextResponse } from "next/server";
import { buildProofOriginHealthReport } from "../../../lib/productionHealth.js";
import { buildGlobalApiSecurityHeaders } from "../../../lib/vaultSecurityHeaders.js";

export const dynamic = "force-dynamic";

function withSecurityHeaders(response) {
  for (const header of buildGlobalApiSecurityHeaders()) {
    response.headers.set(header.key, header.value);
  }
  return response;
}

export async function GET() {
  try {
    const report = await buildProofOriginHealthReport();
    const statusCode = report.status === "error" ? 503 : 200;

    return withSecurityHeaders(
      NextResponse.json(report, {
        status: statusCode,
        headers: {
          "Cache-Control": "no-store",
        },
      })
    );
  } catch (error) {
    return withSecurityHeaders(
      NextResponse.json(
        {
          ok: false,
          service: "prooforigin",
          status: "error",
          error: error.message || "Health check failed.",
        },
        { status: 503 }
      )
    );
  }
}
