import { useEffect, useState } from "react";
import { useSiteSettings } from "@/context/siteSettings";

interface PaymentMethod {
  id: number;
  name: string;
  code: string;
  iconUrl: string | null;
  altText: string | null;
  enabled: boolean;
  sortOrder: number;
}

export function PaymentIcons() {
  const { settings } = useSiteSettings();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!settings.paymentIconsEnabled) return;
    fetch(`${basePath}/api/payment-methods`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMethods(Array.isArray(data) ? data : []))
      .catch(() => setMethods([]));
  }, [settings.paymentIconsEnabled, basePath]);

  if (!settings.paymentIconsEnabled || methods.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      {methods.map((method) => (
        <div
          key={method.id}
          className="h-10 px-3 bg-white rounded-lg border border-gray-100 flex items-center justify-center"
          title={method.name}
        >
          {method.iconUrl ? (
            <img
              src={method.iconUrl}
              alt={method.altText || method.name}
              className="h-6 w-auto max-w-[80px] object-contain"
              loading="lazy"
            />
          ) : (
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{method.name}</span>
          )}
        </div>
      ))}
    </div>
  );
}
