import { createContext, useContext, useEffect, useState } from "react";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface FeatureFlags {
  marketplaceEnabled: boolean;
  aiToolsEnabled: boolean;
  registrationEnabled: boolean;
  loginEnabled: boolean;
  guestCheckoutEnabled: boolean;
  oneClickAuthEnabled: boolean;
  maintenanceMode: boolean;
  comingSoonMode: boolean;
  readOnlyMode: boolean;
  maintenanceMessage: string | null;
}

// Fail open: if the flags endpoint hasn't loaded yet (or errors), every
// module stays enabled so a transient network hiccup never locks customers
// out of the storefront. Only an explicit `false` from the server disables
// a module.
const DEFAULTS: FeatureFlags = {
  marketplaceEnabled: true,
  aiToolsEnabled: true,
  registrationEnabled: true,
  loginEnabled: true,
  guestCheckoutEnabled: false,
  oneClickAuthEnabled: true,
  maintenanceMode: false,
  comingSoonMode: false,
  readOnlyMode: false,
  maintenanceMessage: null,
};

interface FeatureFlagsCtx {
  flags: FeatureFlags;
  loaded: boolean;
  reload: () => void;
}

const Ctx = createContext<FeatureFlagsCtx>({ flags: DEFAULTS, loaded: false, reload: () => {} });

export function FeatureFlagsProvider({ children }: { children: React.ReactNode }) {
  const [flags, setFlags] = useState<FeatureFlags>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/feature-flags`);
      if (res.ok) {
        const data = (await res.json()) as FeatureFlags;
        setFlags(data);
      }
    } catch {
      // keep defaults on failure
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return <Ctx.Provider value={{ flags, loaded, reload: load }}>{children}</Ctx.Provider>;
}

export function useFeatureFlags() {
  return useContext(Ctx);
}
