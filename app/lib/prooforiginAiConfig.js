const DEFAULT_PROOFORIGIN_AI_URL =
  "https://prooforigin-ai-production-2983.up.railway.app";

export function getProofOriginAiBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_PROOFORIGIN_AI_URL || DEFAULT_PROOFORIGIN_AI_URL;
  return raw.replace(/\/+$/, "").replace(/\/analyze$/, "");
}

export function getProofOriginAnalyzeUrl() {
  const base = getProofOriginAiBaseUrl();
  return `${base}/analyze`;
}
