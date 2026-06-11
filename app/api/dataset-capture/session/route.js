import { NextResponse } from "next/server";
import { authorizeDatasetCaptureAdmin } from "../../../lib/datasetCaptureAdmin";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const auth = await authorizeDatasetCaptureAdmin(req);

  if (!auth.ok) {
    return NextResponse.json(
      {
        authenticated: auth.status === 403,
        isAdmin: false,
        email: auth.email || null,
        error: auth.error,
      },
      { status: auth.status }
    );
  }

  return NextResponse.json({
    authenticated: true,
    isAdmin: true,
    email: auth.email,
  });
}

export async function POST(req) {
  return GET(req);
}
