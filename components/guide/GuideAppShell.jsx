"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { buildRouteGuideSafeContext } from "../../app/lib/guideSafeContext.js";
import ProofOriginGuideWidget from "./ProofOriginGuideWidget.jsx";

const GuideOverrideContext = createContext(null);

export function useGuideContextOverride(context) {
  const setOverride = useContext(GuideOverrideContext);

  useEffect(() => {
    if (!setOverride) {
      return undefined;
    }

    setOverride(context ?? null);
    return () => setOverride(null);
  }, [setOverride, context]);
}

export default function GuideAppShell({ children }) {
  const pathname = usePathname();
  const [override, setOverride] = useState(null);

  const context = useMemo(
    () => override ?? buildRouteGuideSafeContext(pathname),
    [override, pathname]
  );

  return (
    <GuideOverrideContext.Provider value={setOverride}>
      {children}
      <ProofOriginGuideWidget context={context} />
    </GuideOverrideContext.Provider>
  );
}
