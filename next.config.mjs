import {
  buildVaultApiSecurityHeaders,
  buildVaultPageSecurityHeaders,
} from "./app/lib/vaultSecurityHeaders.js";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    const vaultPageHeaders = buildVaultPageSecurityHeaders();
    const vaultApiHeaders = buildVaultApiSecurityHeaders();

    return [
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
    ];
  },
};

export default nextConfig;
