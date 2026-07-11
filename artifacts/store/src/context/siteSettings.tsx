import { createContext, useContext, useEffect, useState } from "react";

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface SiteSettings {
  id: number;
  siteLogoUrl: string | null;
  siteHeadline: string;
  siteSubheadline: string;
  paymentFooterText: string;
  copyrightText: string;
  copyrightYear: string;
  useDynamicCopyrightYear: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

const DEFAULTS: SiteSettings = {
  id: 1,
  siteLogoUrl: null,
  siteHeadline: "Everything You Need to Get More Done with AI",
  siteSubheadline:
    "Access premium AI tools, manage your subscription with ease, and work smarter—all from one platform.",
  paymentFooterText: "All payments are securely processed with Paystack's end-to-end encryption.",
  copyrightText: "Top Rated SEO Tools",
  copyrightYear: String(new Date().getFullYear()),
  useDynamicCopyrightYear: true,
  updatedAt: null,
  updatedBy: null,
};

interface SiteSettingsCtx {
  settings: SiteSettings;
  reload: () => void;
}

const Ctx = createContext<SiteSettingsCtx>({ settings: DEFAULTS, reload: () => {} });

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings>(DEFAULTS);

  const load = async () => {
    try {
      const res = await fetch(`${BASE_PATH}/api/site-settings`);
      if (res.ok) {
        const data = await res.json() as SiteSettings;
        setSettings(data);
      }
    } catch {
    }
  };

  useEffect(() => { load(); }, []);

  return <Ctx.Provider value={{ settings, reload: load }}>{children}</Ctx.Provider>;
}

export function useSiteSettings() {
  return useContext(Ctx);
}
