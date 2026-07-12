import { useEffect, useState } from "react";
import { getHomeIcon } from "./icon-map";

interface Step {
  id: number;
  icon: string;
  title: string;
  description: string;
  sortOrder: number;
}

const FALLBACK: Step[] = [
  { id: -1, icon: "MousePointerClick", title: "Choose Your Tool", description: "Browse our catalog and pick the tool subscription that fits your needs.", sortOrder: 0 },
  { id: -2, icon: "CreditCard", title: "Pay Securely", description: "Complete checkout with our secure, encrypted payment processing.", sortOrder: 1 },
  { id: -3, icon: "CheckCircle2", title: "Get Instant Access", description: "Your access details appear in your dashboard right after payment is confirmed.", sortOrder: 2 },
];

export function HowItWorks() {
  const [steps, setSteps] = useState<Step[]>(FALLBACK);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${basePath}/api/how-it-works-steps`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Step[]) => {
        if (Array.isArray(data) && data.length > 0) setSteps(data);
      })
      .catch(() => {});
  }, [basePath]);

  return (
    <section className="py-20 bg-white border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-5xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">How It</span> Works
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {steps.map((step, i) => {
            const Icon = getHomeIcon(step.icon);
            return (
              <div key={step.id} className="relative text-center" data-testid={`step-how-it-works-${step.id}`}>
                <div className="w-16 h-16 rounded-full bg-primary text-white flex items-center justify-center mx-auto mb-5 shadow-md text-xl font-heading font-bold">
                  {i + 1}
                </div>
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="font-bold text-foreground text-lg mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
