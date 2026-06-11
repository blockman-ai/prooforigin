import { createClient } from "@supabase/supabase-js";

let adminClient = null;

export function isSupabaseAdminConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return Boolean(
    url &&
      key &&
      /^https?:\/\//i.test(url) &&
      !url.includes("YOUR_") &&
      !key.includes("YOUR_")
  );
}

export function getSupabaseAdmin() {
  if (!adminClient) {
    if (!isSupabaseAdminConfigured()) {
      throw new Error(
        "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
      );
    }

    adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }

  return adminClient;
}
