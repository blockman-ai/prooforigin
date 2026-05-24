import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default async function VerifyPage({ params }) {
  const { proofId } = params;

  const { data: proof, error } = await supabase
    .from("proofs")
    .select("*")
    .eq("proof_id", proofId)
    .single();

  if (error || !proof) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Proof Not Found</h1>
        <p>This verification record does not exist.</p>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h1>Verified by ProofOrigin</h1>

      <p><strong>Proof ID:</strong> {proof.proof_id}</p>
      <p><strong>File Name:</strong> {proof.file_name}</p>
      <p><strong>File Type:</strong> {proof.file_type}</p>
      <p><strong>Status:</strong> {proof.status}</p>
      <p><strong>Created:</strong> {new Date(proof.created_at).toLocaleString()}</p>

      {proof.public_url && proof.file_type?.startsWith("image/") && (
        <img
          src={proof.public_url}
          alt={proof.file_name}
          style={{ maxWidth: "100%", borderRadius: 16, marginTop: 20 }}
        />
      )}

      <hr style={{ margin: "30px 0" }} />

      <h2>ProofOrigin Certificate</h2>
      <p>
        This file has been uploaded and registered with a unique ProofOrigin
        verification record.
      </p>

      <p><strong>Bitcoin anchoring:</strong> Coming soon</p>
      <p><strong>AI authenticity analysis:</strong> Coming soon</p>
    </main>
  );
          }
