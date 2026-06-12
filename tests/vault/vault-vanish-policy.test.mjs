import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldSuspendVaultFocusVanish } from "../../app/lib/vaultVanishPolicy.js";

test("shouldSuspendVaultFocusVanish is false when vault is idle", () => {
  assert.equal(
    shouldSuspendVaultFocusVanish({
      showUploadModal: false,
      uploadBusy: false,
      filePickerOpen: false,
    }),
    false
  );
});

test("shouldSuspendVaultFocusVanish while upload modal is open", () => {
  assert.equal(
    shouldSuspendVaultFocusVanish({
      showUploadModal: true,
      uploadBusy: false,
      filePickerOpen: false,
    }),
    true
  );
});

test("shouldSuspendVaultFocusVanish while OS file picker is active", () => {
  assert.equal(
    shouldSuspendVaultFocusVanish({
      showUploadModal: false,
      uploadBusy: false,
      filePickerOpen: true,
    }),
    true
  );
});

test("shouldSuspendVaultFocusVanish while encryption or upload is in progress", () => {
  assert.equal(
    shouldSuspendVaultFocusVanish({
      showUploadModal: false,
      uploadBusy: true,
      filePickerOpen: false,
    }),
    true
  );
});

test("shouldSuspendVaultFocusVanish restores after upload session ends", () => {
  assert.equal(
    shouldSuspendVaultFocusVanish({
      showUploadModal: false,
      uploadBusy: false,
      filePickerOpen: false,
    }),
    false
  );
});
