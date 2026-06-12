import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildGenericGuideSafeContext,
  buildRouteGuideSafeContext,
  resolveGuideFeatureFromRoute,
} from "../../app/lib/guideSafeContext.js";
import { validateGuideContext } from "../../app/lib/guideSchema.js";

test("resolveGuideFeatureFromRoute maps app routes", () => {
  assert.equal(resolveGuideFeatureFromRoute("/vault"), "vault");
  assert.equal(resolveGuideFeatureFromRoute("/identity-card"), "trust_pass");
  assert.equal(resolveGuideFeatureFromRoute("/id/abc-123"), "trust_pass");
  assert.equal(resolveGuideFeatureFromRoute("/voice-anchor"), "voice_anchor");
  assert.equal(resolveGuideFeatureFromRoute("/detect"), "provenance");
  assert.equal(resolveGuideFeatureFromRoute("/upload"), "provenance");
  assert.equal(resolveGuideFeatureFromRoute("/"), "general");
});

test("generic guide context contains no vault secrets", () => {
  const context = buildGenericGuideSafeContext({
    route: "/identity-card",
    feature: "trust_pass",
  });

  assert.deepEqual(context, {
    route: "/identity-card",
    feature: "trust_pass",
    app: { betaDisclaimer: true },
  });
  assert.equal(Object.hasOwn(context, "vault"), false);
  assert.equal(Object.hasOwn(context, "pin"), false);

  const validated = validateGuideContext(context);
  assert.equal(validated.feature, "trust_pass");
  assert.equal(validated.app.betaDisclaimer, true);
});

test("buildRouteGuideSafeContext stays route-aware for non-vault pages", () => {
  const context = buildRouteGuideSafeContext("/voice-anchor");
  assert.equal(context.route, "/voice-anchor");
  assert.equal(context.feature, "voice_anchor");
  assert.deepEqual(context.app, { betaDisclaimer: true });
});

test("guide widget includes mobile sheet class in source", () => {
  const source = readFileSync("components/guide/ProofOriginGuideWidget.jsx", "utf8");
  assert.match(source, /prooforigin-guide--mobile-sheet/);
  assert.match(source, /prooforigin-guide--open/);
});

test("GuideAppShell mounts widget globally from layout", () => {
  const layout = readFileSync("app/layout.jsx", "utf8");
  const shell = readFileSync("components/guide/GuideAppShell.jsx", "utf8");
  assert.match(layout, /GuideAppShell/);
  assert.match(shell, /ProofOriginGuideWidget/);
  assert.match(shell, /buildRouteGuideSafeContext/);
});
