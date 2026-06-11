import { createClient } from "@supabase/supabase-js";

export function getDatasetCaptureAdminEmails() {
  const raw = process.env.DATASET_CAPTURE_ADMIN_EMAILS || "";

  return raw
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isDatasetCaptureAdminEmail(email) {
  if (!email || typeof email !== "string") {
    return false;
  }

  const allowed = getDatasetCaptureAdminEmails();
  if (!allowed.length) {
    return false;
  }

  return allowed.includes(email.trim().toLowerCase());
}

export function getBearerToken(req) {
  const header = req.headers.get("authorization") || "";

  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }

  return "";
}

export async function authorizeDatasetCaptureAdmin(req) {
  const allowed = getDatasetCaptureAdminEmails();

  if (!allowed.length) {
    return {
      ok: false,
      status: 503,
      error: "Dataset capture admin access is not configured.",
    };
  }

  const token = getBearerToken(req);

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Login required.",
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (
    !url ||
    !anonKey ||
    !/^https?:\/\//i.test(url) ||
    url.includes("YOUR_") ||
    anonKey.includes("YOUR_")
  ) {
    return {
      ok: false,
      status: 503,
      error: "Supabase auth is not configured.",
    };
  }

  const supabase = createClient(url, anonKey);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user?.email) {
    return {
      ok: false,
      status: 401,
      error: "Invalid or expired login session.",
    };
  }

  if (!isDatasetCaptureAdminEmail(user.email)) {
    return {
      ok: false,
      status: 403,
      error: "Access denied. Admin approval required.",
      email: user.email,
    };
  }

  return {
    ok: true,
    user,
    email: user.email,
    accessToken: token,
  };
}

export function datasetCaptureAuthFailureResponse(auth) {
  return {
    success: false,
    error: auth.error,
  };
}
