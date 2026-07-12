import { useSiteSettings } from "@/context/siteSettings";
import { MessageCircle, Mail, ShieldCheck } from "lucide-react";

export function SupportCredibility() {
  const { settings } = useSiteSettings();

  const digits = settings.whatsappNumber?.replace(/\D/g, "") || "";
  const whatsappHref =
    settings.whatsappEnabled && digits.length >= 10
      ? `https://wa.me/${digits}?text=${encodeURIComponent(settings.whatsappMessage || "")}`
      : null;

  const showEmail = settings.businessEmailPublic && !!settings.businessEmail;

  if (!whatsappHref && !showEmail) return null;

  return (
    <section className="py-20 bg-primary/5 border-t border-border" data-testid="section-support-credibility">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl text-center">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <ShieldCheck className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl md:text-3xl font-heading tracking-tight mb-4 uppercase text-foreground">
          Real People. Real Support.
        </h2>
        <p className="text-muted-foreground max-w-xl mx-auto mb-8 leading-relaxed">
          {settings.supportPageMessage || "Have a question before you buy? Reach out and we'll respond as quickly as we can."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          {whatsappHref && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="link-support-whatsapp"
              className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#1DA851] text-white font-bold rounded-lg px-6 h-12 text-sm transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
              Chat on WhatsApp
            </a>
          )}
          {showEmail && (
            <a
              href={settings.businessEmailClickable ? `mailto:${settings.businessEmail}` : undefined}
              data-testid="link-support-email"
              className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-primary/40 text-foreground font-bold rounded-lg px-6 h-12 text-sm transition-colors"
            >
              <Mail className="w-4 h-4" />
              {settings.businessEmail}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
