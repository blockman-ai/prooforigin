import crypto from "crypto";
import { NextResponse } from "next/server";
import {
  buildVoiceFingerprintHash,
  emailLooksValid,
  generateEnrollmentToken,
  hashEnrollmentToken,
  isAllowedVoiceMime,
  VOICE_ANCHOR_MAX_BYTES,
  VOICE_ANCHOR_VERSION,
} from "../../../lib/voiceAnchor";
import {
  getSupabaseAdmin,
  isSupabaseAdminConfigured,
} from "../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const TABLE = "voice_anchor_enrollments";

export async function POST(req) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");
    const contactEmail = String(formData.get("contact_email") || "").trim();
    const consent = formData.get("consent") === "true";
    const durationRaw = formData.get("duration_ms");
    const durationMs =
      durationRaw != null && durationRaw !== ""
        ? Math.max(0, parseInt(String(durationRaw), 10) || 0)
        : null;

    if (!consent) {
      return NextResponse.json(
        { success: false, error: "Consent is required to create a voice anchor." },
        { status: 400 }
      );
    }

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "An audio recording or file is required." },
        { status: 400 }
      );
    }

    if (contactEmail && !emailLooksValid(contactEmail)) {
      return NextResponse.json(
        { success: false, error: "Enter a valid email or leave the field blank." },
        { status: 400 }
      );
    }

    const mimeType = file.type || "application/octet-stream";
    if (!isAllowedVoiceMime(mimeType)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported file type. Upload or record an audio file.",
        },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length === 0) {
      return NextResponse.json(
        { success: false, error: "The audio file is empty." },
        { status: 400 }
      );
    }

    if (buffer.length > VOICE_ANCHOR_MAX_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Audio must be ${Math.round(VOICE_ANCHOR_MAX_BYTES / (1024 * 1024))} MB or smaller.`,
        },
        { status: 400 }
      );
    }

    const { fingerprintHash } = buildVoiceFingerprintHash(buffer, {
      mimeType,
      byteSize: buffer.length,
      durationMs,
    });

    const enrollmentToken = generateEnrollmentToken();
    const enrollmentTokenHash = hashEnrollmentToken(enrollmentToken);
    const enrolledAt = new Date().toISOString();

    if (isSupabaseAdminConfigured()) {
      try {
        const supabase = getSupabaseAdmin();
        const { data, error } = await supabase
          .from(TABLE)
          .insert({
            enrollment_token_hash: enrollmentTokenHash,
            fingerprint_hash: fingerprintHash,
            mime_type: mimeType,
            byte_size: buffer.length,
            duration_ms: durationMs,
            contact_email: contactEmail || null,
            metadata: {
              version: VOICE_ANCHOR_VERSION,
              file_name: file.name || null,
            },
          })
          .select("id, fingerprint_hash, enrolled_at")
          .single();

        if (error) throw error;

        return NextResponse.json({
          success: true,
          stored: true,
          enrollment_id: data.id,
          enrollment_token: enrollmentToken,
          fingerprint_hash: data.fingerprint_hash,
          enrolled_at: data.enrolled_at,
          message: "Voice anchor saved. Raw audio was not stored.",
        });
      } catch (dbError) {
        return NextResponse.json({
          success: true,
          stored: false,
          enrollment_token: enrollmentToken,
          fingerprint_hash: fingerprintHash,
          enrolled_at: enrolledAt,
          warning:
            dbError.message ||
            "Database unavailable. Fingerprint computed in demo mode only.",
          message:
            "Fingerprint computed — not saved. Run docs/sql/voice_anchor_enrollments.sql in Supabase.",
        });
      }
    }

    return NextResponse.json({
      success: true,
      stored: false,
      enrollment_token: enrollmentToken,
      fingerprint_hash: fingerprintHash,
      enrolled_at: enrolledAt,
      warning:
        "Supabase service role is not configured. Fingerprint computed in demo mode only.",
      message:
        "Fingerprint computed — not saved to database. Configure Supabase to persist enrollments.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Voice anchor enrollment failed.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const enrollmentId = String(body.enrollment_id || "").trim();
    const enrollmentToken = String(body.enrollment_token || "").trim();

    if (!enrollmentId || !enrollmentToken) {
      return NextResponse.json(
        {
          success: false,
          error: "Enrollment id and token are required to delete a voice anchor.",
        },
        { status: 400 }
      );
    }

    if (!isSupabaseAdminConfigured()) {
      return NextResponse.json({
        success: true,
        stored: false,
        message:
          "Demo mode — nothing was stored server-side. Clear this browser session locally.",
      });
    }

    const supabase = getSupabaseAdmin();
    const tokenHash = hashEnrollmentToken(enrollmentToken);
    const { data, error } = await supabase
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", enrollmentId)
      .eq("enrollment_token_hash", tokenHash)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message || "Delete failed." },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          success: false,
          error: "Voice anchor not found or already deleted.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      stored: true,
      message: "Voice anchor deleted. Fingerprint record removed.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Voice anchor delete failed.",
      },
      { status: 500 }
    );
  }
}
