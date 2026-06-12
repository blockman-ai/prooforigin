import assert from "node:assert/strict";
import { register } from "node:module";
import { test } from "node:test";

register("../helpers/resolve-app-imports.mjs", import.meta.url);

const {
  buildVaultApiSecurityHeaders,
  buildVaultContentSecurityPolicy,
  buildVaultPageSecurityHeaders,
  buildGlobalSecurityHeaders,
  buildTrustPassSecurityHeaders,
} = await import("../../app/lib/vaultSecurityHeaders.js");

test("vault page CSP allows self-hosted worker and blob rendering", () => {
  const csp = buildVaultContentSecurityPolicy();

  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /img-src 'self' blob: data:/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.doesNotMatch(csp, /https:\/\/cdn\./);
});

test("vault page security headers include required hardening headers", () => {
  const headers = Object.fromEntries(
    buildVaultPageSecurityHeaders().map(({ key, value }) => [key, value])
  );

  assert.ok(headers["Content-Security-Policy"]);
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Cache-Control"], "no-store");
  assert.match(headers["Permissions-Policy"], /camera=\(\)/);
});

test("vault API security headers use minimal CSP and no-store cache", () => {
  const headers = Object.fromEntries(
    buildVaultApiSecurityHeaders().map(({ key, value }) => [key, value])
  );

  assert.match(headers["Content-Security-Policy"], /default-src 'none'/);
  assert.equal(headers["Cache-Control"], "no-store");
  assert.equal(headers["X-Frame-Options"], "DENY");
});

test("global security headers harden non-vault pages without strict vault CSP", () => {
  const headers = Object.fromEntries(
    buildGlobalSecurityHeaders().map(({ key, value }) => [key, value])
  );

  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["X-Frame-Options"], "SAMEORIGIN");
  assert.ok(headers["Cross-Origin-Opener-Policy"]);
});

test("trust pass security headers deny framing and disable caching", () => {
  const headers = Object.fromEntries(
    buildTrustPassSecurityHeaders().map(({ key, value }) => [key, value])
  );

  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Referrer-Policy"], "no-referrer");
  assert.equal(headers["Cache-Control"], "no-store");
});
