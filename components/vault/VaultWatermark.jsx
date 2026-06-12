"use client";

import { formatProtectedViewTimestamp } from "../../app/lib/vaultProtectedView";

export default function VaultWatermark({ vaultIdShort, timestamp }) {
  const displayTimestamp = formatProtectedViewTimestamp(timestamp);

  return (
    <div className="vault-watermark" aria-hidden="true">
      <div className="vault-watermark__tile">
        <span>ProofOrigin</span>
        <span>Protected View</span>
        <span>{displayTimestamp}</span>
        <span>{vaultIdShort}</span>
      </div>
      <div className="vault-watermark__pattern">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="vault-watermark__tile vault-watermark__tile--ghost">
            <span>ProofOrigin</span>
            <span>Protected View</span>
            <span>{displayTimestamp}</span>
            <span>{vaultIdShort}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
