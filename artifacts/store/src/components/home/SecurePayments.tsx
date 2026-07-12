import { useSiteSettings } from "@/context/siteSettings";
import { PaymentIcons } from "@/components/PaymentIcons";
import { Lock } from "lucide-react";

export function SecurePayments() {
  const { settings } = useSiteSettings();
  if (!settings.paymentIconsEnabled) return null;

  return (
    <section className="py-16 bg-white border-t border-border" data-testid="section-secure-payments">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl text-center">
        <div className="flex items-center justify-center gap-2 mb-6 text-muted-foreground">
          <Lock className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Secure Checkout</span>
        </div>
        <PaymentIcons />
        <p className="text-xs text-muted-foreground max-w-md mx-auto mt-6 leading-relaxed">
          {settings.paymentFooterText}
        </p>
      </div>
    </section>
  );
}
