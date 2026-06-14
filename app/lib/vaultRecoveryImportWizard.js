import { parseRecoveryKit, VAULT_RECOVERY_KIT_VERSION } from "./vaultRecovery.js";
import {
  unwrapMvkForImport,
  validateRecoveryImportInputs,
  VaultRecoveryImportError,
} from "./vaultRecoveryImport.js";
import { wipeSensitiveBytes } from "./vaultKeyRing.js";

export const RECOVERY_WIZARD_STEPS = Object.freeze({
  KIT: "kit",
  PHRASE: "phrase",
  PIN: "pin",
  COMPLETE: "complete",
});

export const RECOVERY_WIZARD_STEP_ORDER = Object.freeze([
  RECOVERY_WIZARD_STEPS.KIT,
  RECOVERY_WIZARD_STEPS.PHRASE,
  RECOVERY_WIZARD_STEPS.PIN,
  RECOVERY_WIZARD_STEPS.COMPLETE,
]);

export function getWizardStepIndex(step) {
  return RECOVERY_WIZARD_STEP_ORDER.indexOf(step);
}

export function getNextWizardStep(currentStep) {
  const index = getWizardStepIndex(currentStep);
  if (index < 0 || index >= RECOVERY_WIZARD_STEP_ORDER.length - 1) {
    return null;
  }

  return RECOVERY_WIZARD_STEP_ORDER[index + 1];
}

export function getPreviousWizardStep(currentStep) {
  const index = getWizardStepIndex(currentStep);
  if (index <= 0) {
    return null;
  }

  return RECOVERY_WIZARD_STEP_ORDER[index - 1];
}

export function validateRecoveryKitUpload(recoveryKitInput) {
  if (recoveryKitInput == null) {
    throw new VaultRecoveryImportError(
      "Recovery kit file is required. Phrase alone is not enough.",
      "KIT_REQUIRED"
    );
  }

  if (typeof recoveryKitInput === "string" && !recoveryKitInput.trim()) {
    throw new VaultRecoveryImportError(
      "Recovery kit file is required. Phrase alone is not enough.",
      "KIT_REQUIRED"
    );
  }

  try {
    let serializedKit;

    if (typeof recoveryKitInput === "string") {
      serializedKit = recoveryKitInput.trim();
    } else if (typeof recoveryKitInput === "object") {
      serializedKit = JSON.stringify(recoveryKitInput);
    } else {
      throw new Error("Unsupported recovery kit input.");
    }

    const kit = parseRecoveryKit(serializedKit);

    if (kit.version !== VAULT_RECOVERY_KIT_VERSION) {
      throw new Error("Unsupported recovery kit version.");
    }

    return {
      kit,
      serializedKit,
      vaultId: kit.vault_id,
    };
  } catch (error) {
    if (error instanceof VaultRecoveryImportError) {
      throw error;
    }

    throw new VaultRecoveryImportError(
      error?.message || "Recovery kit is invalid or unsupported.",
      "KIT_INVALID"
    );
  }
}

export function validateRecoveryPhraseStep({ recoveryPhrase, recoveryKit }) {
  return validateRecoveryImportInputs({ recoveryPhrase, recoveryKit });
}

export async function verifyRecoveryPhraseForWizard({ recoveryPhrase, recoveryKit }) {
  const { masterVaultKey, recoveryKit: kit, normalizedPhrase } = await unwrapMvkForImport(
    recoveryKit,
    recoveryPhrase
  );

  try {
    return {
      recoveryKit: kit,
      normalizedPhrase,
    };
  } finally {
    wipeSensitiveBytes(masterVaultKey);
  }
}

export function formatVaultRecoveryImportError(error) {
  if (error instanceof VaultRecoveryImportError) {
    return error.message;
  }

  return error?.message || "Unable to complete recovery import.";
}
