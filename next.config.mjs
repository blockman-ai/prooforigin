import {
  buildVaultApiSecurityHeaders,
  buildVaultPageSecurityHeaders,
  buildGlobalSecurityHeaders,
  buildTrustPassSecurityHeaders,
} from "./app/lib/vaultSecurityHeaders.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const vaultPageHeaders = buildVaultPageSecurityHeaders();
    const vaultApiHeaders = buildVaultApiSecurityHeaders();
    const globalHeaders = buildGlobalSecurityHeaders();
    const trustPassHeaders = buildTrustPassSecurityHeaders();

    return [
      {
        source: "/:path*",
        headers: globalHeaders,
      },
      {
        source: "/vault",
        headers: vaultPageHeaders,
      },
      {
        source: "/vault/:path*",
        headers: vaultPageHeaders,
      },
      {
        source: "/api/vault/:path*",
        headers: vaultApiHeaders,
      },
      {
        source: "/identity-card",
        headers: trustPassHeaders,
      },
      {
        source: "/id/:path*",
        headers: trustPassHeaders,
      },
      {
        source: "/voice-anchor",
        headers: trustPassHeaders,
      },
      {
        source: "/api/identity-card/:path*",
        headers: vaultApiHeaders,
      },
      {
        source: "/api/voice-anchor/:path*",
        headers: vaultApiHeaders,
      },
      {
        source: "/api/health/:path*",
        headers: vaultApiHeaders,
      },
    ];
  },
};

export default nextConfig;
