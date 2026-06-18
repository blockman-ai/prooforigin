import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeScaledDimensions,
  describeUnsupportedAssetImage,
  isHeicAssetImage,
  isSupportedAssetImageType,
} from "../../app/lib/assetImageInput.js";

describe("assetImageInput helpers", () => {
  it("detects HEIC files by extension and mime", () => {
    assert.equal(isHeicAssetImage({ name: "photo.HEIC", type: "" }), true);
    assert.equal(isHeicAssetImage({ name: "photo.jpg", type: "image/heif" }), true);
    assert.equal(isHeicAssetImage({ name: "photo.jpg", type: "image/jpeg" }), false);
  });

  it("describes unsupported HEIC with collector-friendly copy", () => {
    const message = describeUnsupportedAssetImage({ name: "IMG_001.heic", type: "" });
    assert.match(message, /HEIC\/HEIF/i);
  });

  it("accepts supported mime and extension fallbacks", () => {
    assert.equal(isSupportedAssetImageType({ name: "a.jpg", type: "image/jpeg" }), true);
    assert.equal(isSupportedAssetImageType({ name: "a.webp", type: "" }), true);
    assert.equal(isSupportedAssetImageType({ name: "a.heic", type: "" }), false);
  });

  it("scales dimensions while preserving aspect ratio", () => {
    const scaled = computeScaledDimensions(4000, 3000, 1600);
    assert.equal(scaled.width, 1600);
    assert.equal(scaled.height, 1200);

    const unchanged = computeScaledDimensions(800, 600, 1600);
    assert.deepEqual(unchanged, { width: 800, height: 600 });
  });
});
