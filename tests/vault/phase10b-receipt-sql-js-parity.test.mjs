import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { computeDisclosureReceiptHash } from "../../app/lib/vaultDisclosureReceipt.js";

const SQL = readFileSync(
  new URL("../../docs/sql/disclosure_phase10_controlled_protocol_repair.sql", import.meta.url),
  "utf8"
);

test("disclosure receipt SQL uses JS-reproducible canonical separators and timestamps", () => {
  assert.match(SQL, /concat_ws\(\s*chr\(10\),/i);
  assert.match(
    SQL,
    /to_char\(p_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.MS"Z"'\)/i
  );
  assert.doesNotMatch(SQL, /concat_ws\(\s*'\\n'/i);
});

test("disclosure receipt SQL hashes UTF-8 input via prooforigin_sha256_hex", () => {
  assert.match(
    SQL,
    /v_receipt_hash\s*:=\s*public\.prooforigin_sha256_hex\(\s*concat_ws\(/i
  );
  assert.doesNotMatch(SQL, /concat_ws\([\s\S]*?\)::bytea,\s*'sha256'/i);
});

test("disclosure receipt hash normalizes database timestamps to UTC milliseconds", () => {
  const common = {
    receiptId: "55555555-5555-4555-8555-555555555555",
    grantRef: "22222222-2222-4222-8222-222222222222",
    policyRef: "11111111-1111-4111-8111-111111111111",
    sessionRef: "33333333-3333-4333-8333-333333333333",
    eventRef: "44444444-4444-4444-8444-444444444444",
    scopeType: "vault_claim",
    scopeRefHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    recipientBindingHash: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    policySnapshotHash: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    conditionProfileHash: "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    custodySnapshotHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    disclosureDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };

  assert.equal(
    computeDisclosureReceiptHash({
      ...common,
      createdAt: "2026-06-16T12:00:00.000Z",
    }),
    computeDisclosureReceiptHash({
      ...common,
      createdAt: "2026-06-16 12:00:00+00",
    })
  );
});
