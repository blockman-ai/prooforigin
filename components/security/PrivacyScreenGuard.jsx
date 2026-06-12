"use client";

import { useEffect, useState } from "react";
import {
  PRIVACY_OVERLAY_MESSAGE,
  shouldObscurePrivacyScreen,
} from "../../app/lib/privacyCapture.js";

export { PRIVACY_CAPTURE_DISCLAIMER } from "../../app/lib/privacyCapture.js";

export default function PrivacyScreenGuard({
  children,
  strict = false,
  enabled = true,
  className = "",
  overlayMessage = PRIVACY_OVERLAY_MESSAGE,
  watermarkText = "",
  showWatermark = false,
}) {
  const [obscured, setObscured] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setObscured(false);
      return undefined;
    }

    function update() {
      setObscured(
        shouldObscurePrivacyScreen({
          visibilityState: document.visibilityState,
          hasFocus: document.hasFocus(),
          strict,
        })
      );
    }

    document.addEventListener("visibilitychange", update);
    window.addEventListener("blur", update);
    window.addEventListener("focus", update);
    update();

    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("blur", update);
      window.removeEventListener("focus", update);
    };
  }, [enabled, strict]);

  function handleContextMenu(event) {
    if (enabled) {
      event.preventDefault();
    }
  }

  const rootClassName = [
    "privacy-screen-guard",
    showWatermark || watermarkText ? "privacy-screen-guard--watermarked" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName} onContextMenu={handleContextMenu}>
      <div
        className={`privacy-screen-guard__content ${obscured && enabled ? "privacy-screen-guard__content--hidden" : ""}`.trim()}
      >
        {(showWatermark || watermarkText) && (
          <div className="privacy-screen-guard__watermark" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index}>{watermarkText || "ProofOrigin"}</span>
            ))}
          </div>
        )}
        {children}
      </div>

      {obscured && enabled && (
        <div className="privacy-screen-guard__overlay" role="status" aria-live="polite">
          <p className="privacy-screen-guard__overlay-message">{overlayMessage}</p>
        </div>
      )}
    </div>
  );
}
