import { NextResponse } from "next/server";
import { validateDatasetCaptureSecret } from "../../../lib/datasetCapture";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    const body = await req.json();
    const validation = validateDatasetCaptureSecret(body?.secret);

    if (!validation.ok) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: validation.error?.includes("not configured") ? 503 : 401 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid verification request." },
      { status: 400 }
    );
  }
}
