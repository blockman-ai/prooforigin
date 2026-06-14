import RecoveryImportWizard from "../../../components/vault/RecoveryImportWizard";
import PageShell from "../../../components/protocol/PageShell";

export const metadata = {
  title: "Restore Vault | ProofOrigin",
  description:
    "Restore ProofOrigin vault access on a new device using your recovery kit and recovery phrase.",
};

export default function VaultRestorePage() {
  return (
    <PageShell
      narrow
      badge="Private Vault • Recovery Import"
      title="Restore from Recovery Kit"
      subtitle="Recover vault identity on this device with your saved recovery kit and 12-word phrase."
      className="vault-restore-page"
    >
      <RecoveryImportWizard />
    </PageShell>
  );
}
