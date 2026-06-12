import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  PRIVACY_CAPTURE_DISCLAIMER,
  PRIVACY_OVERLAY_MESSAGE,
  shouldObscurePrivacyScreen,
} from "../../app/lib/privacyCapture.js";

test("shouldObscurePrivacyScreen hides on visibility hidden", () => {
  assert.equal(
    shouldObscurePrivacyScreen({
      visibilityState: "hidden",
      hasFocus: true,
      strict: false,
    }),
    true
  );
});

test("shouldObscurePrivacyScreen strict mode hides on blur", () => {
  assert.equal(
    shouldObscurePrivacyScreen({
      visibilityState: "visible",
      hasFocus: false,
      strict: true,
    }),
    true
  );

  assert.equal(
    shouldObscurePrivacyScreen({
      visibilityState: "visible",
      hasFocus: false,
      strict: false,
    }),
    false
  );
});

test("PrivacyScreenGuard renders overlay markup in source", () => {
  const source = readFileSync("components/security/PrivacyScreenGuard.jsx", "utf8");
  assert.match(source, /privacy-screen-guard__overlay/);
  assert.match(source, /privacy-screen-guard__content--hidden/);
  assert.match(PRIVACY_OVERLAY_MESSAGE, /Protected screen/);
});

test("print protection CSS class is present", () => {
  const css = readFileSync("app/globals.css", "utf8");
  assert.match(css, /\.privacy-print-hide/);
  assert.match(css, /@media print/);
});

test("identity and vault pages import privacy guard without guide secrets", () => {
  const vault = readFileSync("app/vault/page.jsx", "utf8");
  const identity = readFileSync("app/identity-card/page.jsx", "utf8");
  const verifier = readFileSync("app/id/[cardId]/page.jsx", "utf8");

  assert.match(vault, /PrivacyScreenGuard/);
  assert.match(identity, /PrivacyScreenGuard/);
  assert.match(verifier, /PrivacyScreenGuard/);
  assert.match(vault, /PRIVACY_CAPTURE_DISCLAIMER/);
  assert.doesNotMatch(vault, /pinConfigured.*guide/i);
  assert.match(PRIVACY_CAPTURE_DISCLAIMER, /may still capture the screen/);
});
