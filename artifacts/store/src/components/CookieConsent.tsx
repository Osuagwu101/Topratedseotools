import { useState, useEffect } from "react";
import { getConsent, setConsent } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Cookie } from "lucide-react";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (getConsent() !== null) return;
    const t = setTimeout(() => setVisible(true), 900);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  const handleAccept = () => {
    setConsent(true);
    setVisible(false);
  };

  const handleDecline = () => {
    setConsent(false);
    setVisible(false);
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-5 animate-in slide-in-from-bottom-4 duration-300"
      role="dialog"
      aria-label="Cookie consent"
    >
      <div className="max-w-2xl mx-auto bg-white border border-border rounded-2xl shadow-2xl p-4 sm:p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
        <div className="flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Cookie className="w-5 h-5 text-primary" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground mb-0.5">We use cookies</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            We use analytics and advertising cookies (Meta Pixel, Google Tag Manager) to improve our
            services and show relevant ads. Essential cookies are always active.
          </p>
        </div>
        <div className="flex gap-2 shrink-0 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleDecline}
            className="flex-1 sm:flex-none text-xs font-bold uppercase tracking-wider h-9 rounded-lg"
          >
            Essential only
          </Button>
          <Button
            size="sm"
            onClick={handleAccept}
            className="flex-1 sm:flex-none text-xs font-bold uppercase tracking-wider h-9 rounded-lg bg-primary text-white hover:bg-primary/90"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
