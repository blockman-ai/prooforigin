import { NextResponse } from "next/server";
import {
  DATASET_CAPTURE_LIST_FIELDS,
  DATASET_CAPTURE_TABLE,
  parseDatasetCaptureRequestBody,
} from "../../../lib/datasetCapture";
import { getSupabaseAdmin, isSupabaseAdminConfigured } from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

export async function POST(req) {
  try {
    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Private dataset storage is not configured. Set SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const access = parseDatasetCaptureRequestBody(body);

    if (!access.ok) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.error?.includes("not configured") ? 503 : 401 }
      );
    }

    const limit = Math.min(Math.max(Number(body.limit) || 50, 1), 100);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from(DATASET_CAPTURE_TABLE)
      .select(DATASET_CAPTURE_LIST_FIELDS)
      .eq("approved_for_training", false)
      .eq("rejected", false)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Unable to load pending captures." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      captures: data || [],
      count: data?.length || 0,
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid list request." },
      { status: 400 }
    );
  }
}
