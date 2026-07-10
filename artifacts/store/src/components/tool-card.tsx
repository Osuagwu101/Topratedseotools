import type { ReactNode } from "react";

export const LOGOS: Record<string, string> = {
  grammarly: "/logos/grammarly.png",
  quillbot: "/logos/quillbot.png",
  phrasly: "/logos/phrasly2.png",
  chatgpt: "/logos/chatgpt.png",
  stealthwriter: "/logos/stealthwriter.png",
  nordvpn: "/logos/nordvpn.png",
  semrush: "/logos/semrush.png",
  capcut: "/logos/capcut.png",
  turnitin: "/logos/turnitin.png",
  writehuman: "/logos/writehuman.png",
  jenni: "/logos/jenni.png",
};

export const BG_COLORS: Record<string, string> = {
  grammarly: "#E8FFF3",
  quillbot: "#EEF4FF",
  phrasly: "#FFF4EC",
  chatgpt: "#F0FDF4",
  stealthwriter: "#F3F0FF",
  nordvpn: "#E8F0FF",
  semrush: "#FFF7E8",
  capcut: "#F0F0F0",
  turnitin: "#FFF0F0",
  writehuman: "#F0FFF8",
  jenni: "#FFF5FF",
};

export function getLogoKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return "grammarly";
  if (n.includes("quillbot")) return "quillbot";
  if (n.includes("phrasly")) return "phrasly";
  if (n.includes("chatgpt")) return "chatgpt";
  if (n.includes("stealth")) return "stealthwriter";
  if (n.includes("nord")) return "nordvpn";
  if (n.includes("semrush")) return "semrush";
  if (n.includes("capcut")) return "capcut";
  if (n.includes("turnitin")) return "turnitin";
  if (n.includes("writehuman") || n.includes("write human")) return "writehuman";
  if (n.includes("jenni")) return "jenni";
  return "";
}

export interface ToolCardProps {
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  priceKobo: number;
  billingPeriod?: string;
  footer: ReactNode;
  testId?: string;
}

export function ToolCard({ name, category, imageUrl, priceKobo, billingPeriod, footer, testId }: ToolCardProps) {
  const key = getLogoKey(name);
  const logoSrc = imageUrl || LOGOS[key] || "";
  const bgColor = BG_COLORS[key] ?? "#F7F8FA";

  return (
    <div
      className="bg-white border border-gray-100 hover:border-primary/40 shadow-sm hover:shadow-lg transition-all duration-300 rounded-lg overflow-hidden flex flex-col group"
      data-testid={testId}
    >
      <div
        className="h-40 flex items-center justify-center p-6"
        style={{ backgroundColor: bgColor }}
      >
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={name + " logo"}
            className="max-h-20 max-w-[160px] w-auto h-auto object-contain drop-shadow-sm"
          />
        ) : (
          <span className="text-4xl font-heading font-bold text-primary">{name[0]}</span>
        )}
      </div>

      <div className="flex flex-col flex-grow px-5 pt-4 pb-5 text-center">
        <h3 className="text-lg font-bold font-sans text-foreground mb-1">{name}</h3>
        {category && (
          <span className="text-xs font-bold text-accent uppercase tracking-widest mb-3 bg-accent/10 py-0.5 px-2 rounded-full inline-block mx-auto">
            {category}
          </span>
        )}

        <div className="mt-auto mb-4">
          <span className="text-3xl font-heading text-primary font-bold">
            ₦{(priceKobo / 100).toLocaleString()}
          </span>
          <span className="text-xs text-muted-foreground font-semibold uppercase tracking-widest block mt-0.5">
            / {billingPeriod === "monthly" ? "month" : "check"}
          </span>
        </div>

        {footer}
      </div>
    </div>
  );
}
