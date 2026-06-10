import GlassPanel from "../../components/protocol/GlassPanel";
import PageShell from "../../components/protocol/PageShell";
import ProtocolBadge from "../../components/protocol/ProtocolBadge";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase";

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <PageShell
        narrow
        badge="Records"
        title="Configuration Required"
        subtitle="Supabase environment variables are not configured."
      />
    );
  }

  const supabase = getSupabase();
  const { data: proofs } = await supabase
    .from("proofs")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <PageShell
      narrow
      heroAlign="left"
      badge="Protocol Records"
      title="Dashboard"
      subtitle="Your latest proof records. Protocol-scoped metadata only—not absolute truth verification."
    >
      <div className="protocol-actions">
        <a href="/upload" className="primary">
          Upload New File
        </a>
      </div>

      <div className="record-list">
        {proofs?.length ? (
          proofs.map((proof) => (
            <GlassPanel key={proof.id} className="record-list__item">
              <div className="record-list__header">
                <strong className="record-list__title">{proof.file_name}</strong>
                <ProtocolBadge
                  variant={proof.status === "evaluated" ? "success" : "pending"}
                >
                  {proof.status}
                </ProtocolBadge>
              </div>
              <p className="record-list__meta">
                Created {new Date(proof.created_at).toLocaleString()}
              </p>
              <a href={`/verify/${proof.proof_id}`} className="secondary record-list__link">
                View Protocol Record
              </a>
            </GlassPanel>
          ))
        ) : (
          <GlassPanel title="No records yet">
            <p className="record-list__empty">
              Upload a file to create your first protocol evaluation record.
            </p>
            <a href="/upload" className="primary">
              Create Proof Record
            </a>
          </GlassPanel>
        )}
      </div>
    </PageShell>
  );
}
