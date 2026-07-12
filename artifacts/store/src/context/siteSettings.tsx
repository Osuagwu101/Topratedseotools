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
  // Trust & support
  businessEmail: string | null;
  businessEmailPublic: boolean;
  businessEmailClickable: boolean;
  whatsappNumber: string | null;
  whatsappMessage: string | null;
  whatsappEnabled: boolean;
  paymentIconsEnabled: boolean;
  // Support page
  supportPageMessage: string | null;
  // Testimonials
  testimonialsEnabled: boolean;
  maxTestimonialsPerPage: number;
  testimonialDisplayPages: string[];
  // Review badges
  verifiedAccessBadgeEnabled: boolean;
  // Customers served counter
  customersServedBaseline: number;
  customersServedCountingMethod: string;
  customersServedManualCorrection: number;
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
  businessEmail: null,
  businessEmailPublic: false,
  businessEmailClickable: true,
  whatsappNumber: null,
  whatsappMessage: "Hello, I need assistance with a product or subscription on Top Rated SEO Tools.",
  whatsappEnabled: false,
  paymentIconsEnabled: true,
  supportPageMessage: "For the fastest response, please reach out to us on WhatsApp. We typically reply within minutes.",
  testimonialsEnabled: false,
  maxTestimonialsPerPage: 9,
  testimonialDisplayPages: ["home"],
  verifiedAccessBadgeEnabled: true,
  customersServedBaseline: 100,
  customersServedCountingMethod: "unique_customers",
  customersServedManualCorrection: 0,
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
