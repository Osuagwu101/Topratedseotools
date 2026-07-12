import { useEffect, useState } from "react";
import { getHomeIcon } from "./icon-map";

interface BenefitCard {
  id: number;
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
}

const FALLBACK: BenefitCard[] = [
  { id: -1, icon: "ShieldCheck", title: "Verified Access", description: "Every tool is set up and tested by us before it reaches you, so access works from day one.", sortOrder: 0 },
  { id: -2, icon: "Wallet", title: "Affordable Pricing", description: "Get the premium tools you rely on at a fraction of their normal subscription cost.", sortOrder: 1 },
  { id: -3, icon: "Zap", title: "Instant Delivery", description: "Access details are delivered to your dashboard as soon as your payment is confirmed.", sortOrder: 2 },
  { id: -4, icon: "HeartHandshake", title: "Real Human Support", description: "Reach us directly over WhatsApp or email whenever you need help with your account.", sortOrder: 3 },
];

export function WhyChooseUs() {
  const [cards, setCards] = useState<BenefitCard[]>(FALLBACK);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${basePath}/api/benefit-cards`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BenefitCard[]) => {
        if (Array.isArray(data) && data.length > 0) setCards(data);
      })
      .catch(() => {});
  }, [basePath]);

  return (
    <section className="py-20 bg-[#F7F8F9] border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">Why Choose</span> Us
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {cards.map((card) => {
            const Icon = getHomeIcon(card.icon);
            return (
              <div
                key={card.id}
                className="bg-white rounded-2xl p-7 border border-gray-100 shadow-sm hover:shadow-lg transition-all text-center"
                data-testid={`card-benefit-${card.id}`}
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-5">
                  <Icon className="w-7 h-7 text-primary" />
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2">{card.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
