export function getSupabaseConnectOrigin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url) {
    return null;
  }

  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildVaultContentSecurityPolicy() {
  const connectSources = ["'self'"];
  const supabaseOrigin = getSupabaseConnectOrigin();

  if (supabaseOrigin) {
    connectSources.push(supabaseOrigin);
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'none'",
    "manifest-src 'self'",
  ].join("; ");
}

export function buildVaultApiContentSecurityPolicy() {
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join("; ");
}

export const VAULT_PERMISSIONS_POLICY =
  "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), display-capture=(), interest-cohort=()";

export function buildVaultPageSecurityHeaders() {
  return [
    { key: "Content-Security-Policy", value: buildVaultContentSecurityPolicy() },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: VAULT_PERMISSIONS_POLICY },
    { key: "Cache-Control", value: "no-store" },
  ];
}

export function buildVaultApiSecurityHeaders() {
  return [
    { key: "Content-Security-Policy", value: buildVaultApiContentSecurityPolicy() },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Permissions-Policy", value: VAULT_PERMISSIONS_POLICY },
    { key: "Cache-Control", value: "no-store" },
  ];
}

export function buildGlobalSecurityHeaders() {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Permissions-Policy", value: "interest-cohort=()" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
}

export function buildTrustPassSecurityHeaders() {
  return [
    ...buildGlobalSecurityHeaders(),
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cache-Control", value: "no-store" },
  ];
}

export function buildGlobalApiSecurityHeaders() {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "Cache-Control", value: "no-store" },
  ];
}
