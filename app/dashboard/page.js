import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function DashboardPage() {
  const { data: proofs } = await supabase
    .from("proofs")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>ProofOrigin Dashboard</h1>
      <p>Your latest proof records.</p>

      <a href="/upload">Upload New File</a>

      <div style={{ marginTop: 24 }}>
        {proofs?.map((proof) => (
          <div
            key={proof.id}
            style={{
              padding: 16,
              border: "1px solid #ddd",
              borderRadius: 12,
              marginBottom: 12,
            }}
          >
            <strong>{proof.file_name}</strong>
            <p>Status: {proof.status}</p>
            <a href={`/verify/${proof.proof_id}`}>View Proof</a>
          </div>
        ))}
      </div>
    </main>
  );
}
