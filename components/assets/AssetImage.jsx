"use client";

import { useEffect, useState } from "react";

export default function AssetImage({
  src,
  alt = "",
  className = "",
  imageClassName = "",
  fallbackClassName = "",
  fallbackIcon = "ASSET",
  fallbackLabel = "Photo unavailable",
  fill = false,
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showImage = Boolean(src) && !failed;

  if (!showImage) {
    return (
      <div
        className={`asset-image-fallback${fill ? " asset-image-fallback--fill" : ""}${
          fallbackClassName ? ` ${fallbackClassName}` : ""
        }`.trim()}
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
      >
        <span className="asset-image-fallback__icon">{fallbackIcon}</span>
        {fallbackLabel ? (
          <span className="asset-image-fallback__label">{fallbackLabel}</span>
        ) : null}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={imageClassName || className}
      onError={() => setFailed(true)}
    />
  );
}
