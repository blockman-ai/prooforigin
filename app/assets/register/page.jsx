"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import GlassPanel from "../../../components/protocol/GlassPanel";
import PageShell from "../../../components/protocol/PageShell";
import ProtocolBadge from "../../../components/protocol/ProtocolBadge";
import {
  ASSET_TYPE_PRESENTATION,
  formatAssetTypeLabel,
  hashClientAssetImage,
  hashClientAssetDescriptor,
  registerAsset,
} from "../../lib/assetRegistryClient";
import { isPhysicalAssetType } from "../../lib/assetRegistry";

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

const REGISTRATION_STEPS = [
  { id: "type", label: "What are you registering?" },
  { id: "details", label: "Add details" },
  { id: "evidence", label: "Add image/evidence" },
  { id: "review", label: "Review and register" },
];

const HERO_ASSET_TYPES = ["psa_card", "memorabilia", "artwork", "document"];

const MORE_ASSET_TYPES = [
  "photo",
  "video",
  "audio",
  "certificate",
  "watch",
  "collectible",
  "other",
];

const EVIDENCE_HELPER_COPY = {
  psa_card:
    "Add the PSA certificate or serial reference. ProofOrigin stores a private proof, not the raw number publicly.",
  memorabilia: "Add COA, signature, event, or source details.",
  artwork: "Add creator, title, medium, edition, or supporting evidence.",
  document: "Add title, record type, or supporting file reference.",
};

const IMAGE_GUIDANCE = {
  psa_card: {
    tone: "encouraged",
    lead: "Add a clear photo of your card for the certificate.",
    detail: "Graded cards look best with a front photo buyers can recognize.",
  },
  memorabilia: {
    tone: "encouraged",
    lead: "Add a photo of the item for the certificate.",
    detail: "Signed items, jerseys, and collectibles are easier to trust with a visual preview.",
  },
  artwork: {
    tone: "encouraged",
    lead: "Add a photo of the artwork for the certificate.",
    detail: "A strong image helps collectors recognize the piece when you share proof.",
  },
  document: {
    tone: "optional",
    lead: "A preview image is optional but recommended.",
    detail: "Add a cover image if you want the certificate to show more than text.",
  },
};

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read image."));
    reader.readAsDataURL(file);
  });
}

function humanizeRegistrationError({ code, error } = {}) {
  const message = String(error || "").toLowerCase();

  if (
    message.includes("unlock your vault") ||
    message.includes("unlock account") ||
    code === "VAULT_AUTH_REQUIRED"
  ) {
    return "Unlock Account & Security to register assets.";
  }

  if (
    code === "VAULT_DEVICE_NOT_BOUND" ||
    code === "VAULT_DEVICE_NOT_REGISTERED" ||
    code === "CHALLENGE_DEVICE_MISMATCH" ||
    message.includes("device key does not match") ||
    message.includes("rebind")
  ) {
    return "Your device needs to be rebound before registering.";
  }

  if (
    code === "OWNERSHIP_VERIFICATION_REQUIRED" ||
    code === "OWNERSHIP_SIGNATURE_INVALID" ||
    code === "OWNERSHIP_KEY_ALREADY_REGISTERED" ||
    message.includes("ownership") ||
    message.includes("signature verification")
  ) {
    return "We could not confirm your ownership key. Reopen Account & Security and try again.";
  }

  return error || "Unable to register asset. Please try again.";
}

function AssetTypeCard({ type, selected, onSelect }) {
  const presentation = ASSET_TYPE_PRESENTATION[type] || {};
  return (
    <button
      type="button"
      className={`asset-type-card${selected ? " asset-type-card--selected" : ""}`}
      onClick={() => onSelect(type)}
      role="radio"
      aria-checked={selected}
    >
      <span className="asset-type-card__icon">{presentation.icon || "ASSET"}</span>
      <strong>{formatAssetTypeLabel(type)}</strong>
      <small>{presentation.help}</small>
    </button>
  );
}

export default function AssetRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState(INITIAL_FORM);
  const [stepIndex, setStepIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const currentStep = REGISTRATION_STEPS[stepIndex];
  const isPhysical = useMemo(
    () => isPhysicalAssetType(form.asset_type),
    [form.asset_type]
  );
  const imageGuidance = IMAGE_GUIDANCE[form.asset_type];
  const evidenceHelper =
    EVIDENCE_HELPER_COPY[form.asset_type] ||
    (isPhysical
      ? "Add serial numbers, COA details, or item notes you want protected privately."
      : "Add a title, file label, or supporting note for your record.");

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function goToStep(index) {
    setError("");
    setStepIndex(Math.max(0, Math.min(index, REGISTRATION_STEPS.length - 1)));
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
      setError("Use an image smaller than 550 KB for the certificate preview.");
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
        throw Object.assign(new Error(result.data?.error || "Unable to register asset."), {
          code: result.data?.code,
        });
      }

      router.push(`/assets/${result.data.asset.asset_id}`);
    } catch (err) {
      setError(
        humanizeRegistrationError({
          code: err.code,
          error: err.message,
        })
      );
      setSubmitting(false);
    }
  }

  return (
    <PageShell
      narrow
      badge="Register Asset"
      title="Register an asset and create a certificate"
      subtitle="Track custody over time and share proof in one link."
    >
      <GlassPanel title="Registration flow">
        <ol className="asset-register-wizard__steps" aria-label="Registration steps">
          {REGISTRATION_STEPS.map((step, index) => {
            const state =
              index < stepIndex ? "complete" : index === stepIndex ? "current" : "upcoming";
            return (
              <li
                key={step.id}
                className={`asset-register-wizard__step asset-register-wizard__step--${state}`}
              >
                <span className="asset-register-wizard__step-index">{index + 1}</span>
                <span className="asset-register-wizard__step-label">{step.label}</span>
              </li>
            );
          })}
        </ol>

        <form className="protocol-form asset-register-wizard__form" onSubmit={onSubmit}>
          {currentStep.id === "type" && (
            <section className="asset-register-wizard__section" aria-labelledby="register-step-type">
              <div className="asset-register-wizard__section-head">
                <h3 id="register-step-type">What are you registering?</h3>
                <p>Choose the asset type that best matches what you want to protect and share.</p>
              </div>

              <div
                className="asset-type-picker asset-type-picker--hero"
                role="radiogroup"
                aria-label="Primary asset types"
              >
                {HERO_ASSET_TYPES.map((type) => (
                  <AssetTypeCard
                    key={type}
                    type={type}
                    selected={form.asset_type === type}
                    onSelect={(value) => updateField("asset_type", value)}
                  />
                ))}
              </div>

              <details className="asset-register-wizard__more-types">
                <summary>More asset types</summary>
                <div
                  className="asset-type-picker"
                  role="radiogroup"
                  aria-label="More asset types"
                >
                  {MORE_ASSET_TYPES.map((type) => (
                    <AssetTypeCard
                      key={type}
                      type={type}
                      selected={form.asset_type === type}
                      onSelect={(value) => updateField("asset_type", value)}
                    />
                  ))}
                </div>
              </details>
            </section>
          )}

          {currentStep.id === "details" && (
            <section className="asset-register-wizard__section" aria-labelledby="register-step-details">
              <div className="asset-register-wizard__section-head">
                <h3 id="register-step-details">Add details</h3>
                <p>Name your asset and write the public summary people will see on the certificate.</p>
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
                <span>Public summary for the certificate</span>
                <textarea
                  value={form.public_summary}
                  onChange={(event) => updateField("public_summary", event.target.value)}
                  placeholder="Optional description shown on the certificate."
                  maxLength={500}
                  rows={4}
                />
              </label>

              <p className="protocol-help">
                You can share the certificate link anytime. Custody updates stay on the timeline as
                ownership changes.
              </p>
            </section>
          )}

          {currentStep.id === "evidence" && (
            <section
              className="asset-register-wizard__section"
              aria-labelledby="register-step-evidence"
            >
              <div className="asset-register-wizard__section-head">
                <h3 id="register-step-evidence">Add image and evidence</h3>
                <p>Add what helps prove the asset while keeping sensitive details private.</p>
              </div>

              <div
                className={`asset-register-wizard__image-note${
                  imageGuidance?.tone === "encouraged"
                    ? " asset-register-wizard__image-note--encouraged"
                    : ""
                }`}
              >
                <strong>{imageGuidance?.lead || "Add a certificate image if you want one."}</strong>
                <span>{imageGuidance?.detail || "This image appears on the public certificate."}</span>
              </div>

              <label className="protocol-field">
                <span>Certificate image</span>
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onImageChange} />
                <small>This image is public on the certificate. Use a preview-safe JPG, PNG, or WebP.</small>
              </label>

              {form.primary_image_url && (
                <div className="asset-image-preview">
                  <img src={form.primary_image_url} alt="Selected asset preview" />
                  <span>Certificate image ready</span>
                </div>
              )}

              {form.asset_type === "psa_card" ? (
                <>
                  <label className="protocol-field">
                    <span>PSA certificate or serial reference</span>
                    <input
                      type="text"
                      value={form.serial_or_cert}
                      onChange={(event) => updateField("serial_or_cert", event.target.value)}
                      placeholder="PSA certificate number"
                    />
                    <small>{EVIDENCE_HELPER_COPY.psa_card}</small>
                  </label>
                  <label className="protocol-field">
                    <span>Item details</span>
                    <input
                      type="text"
                      value={form.descriptor}
                      onChange={(event) => updateField("descriptor", event.target.value)}
                      placeholder="Set, grade, player, or card description"
                    />
                  </label>
                </>
              ) : isPhysical ? (
                <label className="protocol-field">
                  <span>Evidence details</span>
                  <input
                    type="text"
                    value={form.descriptor}
                    onChange={(event) => updateField("descriptor", event.target.value)}
                    placeholder="Serial, COA, artist, model, or item notes"
                  />
                  <small>{evidenceHelper}</small>
                </label>
              ) : (
                <label className="protocol-field">
                  <span>Evidence details</span>
                  <input
                    type="text"
                    value={form.descriptor}
                    onChange={(event) => updateField("descriptor", event.target.value)}
                    placeholder="Title, record type, filename, or supporting note"
                  />
                  <small>{evidenceHelper}</small>
                </label>
              )}
            </section>
          )}

          {currentStep.id === "review" && (
            <section className="asset-register-wizard__section" aria-labelledby="register-step-review">
              <div className="asset-register-wizard__section-head">
                <h3 id="register-step-review">Review and register</h3>
                <p>Confirm what will appear on your certificate before you register the asset.</p>
              </div>

              <div className="asset-register-review">
                <div className="asset-certificate asset-certificate--flagship asset-register-review__certificate">
                  <div className="asset-certificate__image asset-proof-hero__image">
                    {form.primary_image_url ? (
                      <img src={form.primary_image_url} alt="" />
                    ) : (
                      <span>No image yet</span>
                    )}
                  </div>
                  <div className="asset-certificate__body">
                    <div className="asset-certificate__facts">
                      <ProtocolBadge variant="success">ProofOrigin Certificate</ProtocolBadge>
                      <ProtocolBadge variant="success">Registered</ProtocolBadge>
                      <span>{formatAssetTypeLabel(form.asset_type)}</span>
                    </div>
                    <h2>{form.display_name.trim() || formatAssetTypeLabel(form.asset_type)}</h2>
                    <p>{form.public_summary.trim() || "No public summary added yet."}</p>
                    <p className="asset-register-review__note">
                      Sensitive evidence is protected. Public certificate shows only safe information.
                    </p>
                  </div>
                </div>

                <dl className="asset-register-review__facts">
                  <div>
                    <dt>Asset name</dt>
                    <dd>{form.display_name.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt>Asset type</dt>
                    <dd>{formatAssetTypeLabel(form.asset_type)}</dd>
                  </div>
                  <div>
                    <dt>Public summary</dt>
                    <dd>{form.public_summary.trim() || "—"}</dd>
                  </div>
                  <div>
                    <dt>Certificate image</dt>
                    <dd>{form.primary_image_url ? "Added" : "Not added"}</dd>
                  </div>
                  <div>
                    <dt>Evidence details</dt>
                    <dd>
                      {form.descriptor.trim() || form.serial_or_cert.trim()
                        ? "Protected privately"
                        : "None added"}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
          )}

          {error && <p className="form-error">{error}</p>}

          <div className="protocol-actions asset-register-wizard__actions">
            {stepIndex > 0 && (
              <button
                type="button"
                className="secondary"
                disabled={submitting}
                onClick={() => goToStep(stepIndex - 1)}
              >
                Back
              </button>
            )}
            {stepIndex < REGISTRATION_STEPS.length - 1 ? (
              <button type="button" className="primary" onClick={() => goToStep(stepIndex + 1)}>
                Continue
              </button>
            ) : (
              <button type="submit" className="primary" disabled={submitting}>
                {submitting ? "Registering…" : "Register asset"}
              </button>
            )}
            <Link href="/assets" className="secondary">
              Back to Collection
            </Link>
          </div>
        </form>
      </GlassPanel>
    </PageShell>
  );
}
