export function shouldSuspendVaultFocusVanish({
  showUploadModal = false,
  uploadBusy = false,
  filePickerOpen = false,
} = {}) {
  return Boolean(showUploadModal || uploadBusy || filePickerOpen);
}
