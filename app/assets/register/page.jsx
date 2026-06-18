"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import {
  ASSET_REGISTRATION_GROUPS,
  ASSET_TYPE_PRESENTATION,
  formatAssetTypeLabel,
  hashClientAssetImage,
  hashClientAssetDescriptor,
  registerAsset,
} from "../../lib/assetRegistryClient";

const INITIAL_FORM = {
  asset_type: "psa_card",
  display_name: "",
  public_summary: "",
  descriptor: "",
  serial_or_cert: "",
  primary_image_url: "",
  primary_image_hash: "",
};

const MAX_IMAGE_BYTES = 550_000;

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

export default function AssetRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const isPhysical = useMemo(
    () => ASSET_REGISTRATION_GROUPS[1].types.includes(form.asset_type),
    [form.asset_type]
  );

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function onImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) {
      updateField("primary_image_url", "");
      updateField("primary_image_hash", "");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Use an image smaller than 550 KB for this public verification preview.");
      return;
    }

    const dataUrl = await readImageAsDataUrl(file);
    const imageHash = await hashClientAssetImage(dataUrl);
    setForm((current) => ({
      ...current,
      primary_image_url: dataUrl,
      primary_image_hash: imageHash,
    }));
    setError("");
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        asset_type: form.asset_type,
        display_name: form.display_name.trim() || undefined,
        public_summary: form.public_summary.trim() || undefined,
        primary_image_url: form.primary_image_url || undefined,
        primary_image_hash: form.primary_image_hash || undefined,
      };

      if (isPhysical) {
        if (form.descriptor.trim()) {
          payload.physical_descriptor_hash = await hashClientAssetDescriptor(form.descriptor);
        }
        if (form.serial_or_cert.trim()) {
          payload.serial_or_cert_hash = await hashClientAssetDescriptor(form.serial_or_cert);
        }
      } else if (form.descriptor.trim()) {
        payload.primary_evidence_hash = await hashClientAssetDescriptor(form.descriptor);
      }

      const result = await registerAsset(payload);
      if (!result.ok || !result.data?.success) {
        throw new Error(result.data?.error || "Unable to register asset.");
      }

      router.push(`/assets/${result.data.asset.asset_id}`);
    } catch (err) {
      setError(err.message || "Unable to register asset.");
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      narrow
      badge="Asset Registry"
      title="Register an asset"
      subtitle="Create a shareable proof page with a public image, protected-since date, provenance record, and custody timeline."
    >
      <GlassPanel title="1. What are you protecting?">
        <form className="protocol-form" onSubmit={onSubmit}>
          <div className="asset-type-picker" role="radiogroup" aria-label="Asset type">
            {ASSET_REGISTRATION_GROUPS.flatMap((group) =>
              group.types.map((type) => {
                const selected = form.asset_type === type;
                const presentation = ASSET_TYPE_PRESENTATION[type] || {};
                return (
                  <button
                    key={type}
                    type="button"
                    className={`asset-type-card${selected ? " asset-type-card--selected" : ""}`}
                    onClick={() => updateField("asset_type", type)}
                    role="radio"
                    aria-checked={selected}
                  >
                    <span className="asset-type-card__icon">{presentation.icon || "ASSET"}</span>
                    <strong>{formatAssetTypeLabel(type)}</strong>
                    <small>{presentation.help}</small>
                  </button>
                );
              })
            )}
          </div>

          <label className="protocol-field">
            <span>Asset name</span>
            <input
              type="text"
              value={form.display_name}
              onChange={(event) => updateField("display_name", event.target.value)}
              placeholder="2021 PSA 10 Charizard"
              maxLength={120}
            />
          </label>

          <label className="protocol-field">
            <span>Public summary for the proof page</span>
            <textarea
              value={form.public_summary}
              onChange={(event) => updateField("public_summary", event.target.value)}
              placeholder="Optional public description shown on the verification page."
              maxLength={500}
              rows={4}
            />
          </label>

          <label className="protocol-field">
            <span>Primary image</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImageChange} />
            <small>
              This image is public on the verification page. Use a preview-safe JPG, PNG, or WebP.
            </small>
          </label>
          {form.primary_image_url && (
            <div className="asset-image-preview">
              <img src={form.primary_image_url} alt="Selected asset preview" />
              <span>Public verification image ready</span>
            </div>
          )}

          {isPhysical ? (
            <>
              <label className="protocol-field">
                <span>Certificate, serial, or reference number</span>
                <input
                  type="text"
                  value={form.serial_or_cert}
                  onChange={(event) => updateField("serial_or_cert", event.target.value)}
                  placeholder="PSA cert number or serial"
                />
                <small>For a PSA card, use the PSA certificate number. We store a hash, not the raw number.</small>
              </label>
              <label className="protocol-field">
                <span>Item details</span>
                <input
                  type="text"
                  value={form.descriptor}
                  onChange={(event) => updateField("descriptor", event.target.value)}
                  placeholder="Make, model, grade, or item description"
                />
                <small>Example: card set, grade, watch model, artist, or item description.</small>
              </label>
            </>
          ) : (
            <label className="protocol-field">
              <span>File or evidence note</span>
              <input
                type="text"
                value={form.descriptor}
                onChange={(event) => updateField("descriptor", event.target.value)}
                placeholder="Optional evidence label or file descriptor"
              />
              <small>Example: original filename, shoot name, edition note, or private evidence label.</small>
            </label>
          )}

          <p className="protocol-help">
            ProofOrigin creates a public proof page and a private hash-backed record. Sensitive
            identifiers are fingerprinted before storage; the image and public summary are the parts
            you are choosing to show.
          </p>

          {error && <p className="form-error">{error}</p>}

          <div className="protocol-actions">
            <button type="submit" className="primary" disabled={submitting}>
              {submitting ? "Registering…" : "Register asset"}
            </button>
            <Link href="/assets" className="secondary">
              Back to registry
            </Link>
          </div>
        </form>
      </GlassPanel>
    </PageShell>
  );
}
