import { useSiteSettings } from "@/context/siteSettings";
import { MessageCircle } from "lucide-react";

export function WhatsAppButton() {
  const { settings } = useSiteSettings();
  if (!settings.whatsappEnabled || !settings.whatsappNumber) return null;

  // Strip non-numeric characters for the wa.me link, but require a leading country code.
  const digits = settings.whatsappNumber.replace(/\D/g, "");
  if (!digits || digits.length < 10) return null;

  const message = encodeURIComponent(settings.whatsappMessage || "Hello, I need assistance with a product or subscription on Top Rated SEO Tools.");
  const href = `https://wa.me/${digits}?text=${message}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Open WhatsApp support chat"
      className="fixed bottom-6 right-6 z-40 flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg hover:bg-[#1DA851] hover:scale-105 transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#25D366]"
      title="WhatsApp Support"
    >
      <MessageCircle className="w-7 h-7 fill-current" />
    </a>
  );
}
