import { useEffect, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { trackFaqOpened } from "@/lib/analytics";

interface FaqItem {
  id: number;
  question: string;
  answer: string;
  sortOrder: number;
}

const FALLBACK: FaqItem[] = [
  {
    id: -1,
    question: "How does access work after I pay?",
    answer: "Once your payment is confirmed, your access details appear instantly in your dashboard. No waiting, no manual approval.",
    sortOrder: 0,
  },
  {
    id: -2,
    question: "Is this an official reseller of these tools?",
    answer: "We provide subscription access to premium tools at a shared, discounted rate. See our Support page for details on how each tool is provisioned.",
    sortOrder: 1,
  },
  {
    id: -3,
    question: "What if I have an issue with my access?",
    answer: "Reach out via WhatsApp or email and our support team will help resolve it as quickly as possible.",
    sortOrder: 2,
  },
  {
    id: -4,
    question: "Can I cancel or change my plan?",
    answer: "Yes — visit your dashboard to manage your active subscriptions, or contact support for help.",
    sortOrder: 3,
  },
];

export function FAQ() {
  const [items, setItems] = useState<FaqItem[]>(FALLBACK);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${basePath}/api/faq-items`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: FaqItem[]) => {
        if (Array.isArray(data) && data.length > 0) setItems(data);
      })
      .catch(() => {});
  }, [basePath]);

  if (items.length === 0) return null;

  return (
    <section className="py-20 bg-[#F7F8F9] border-t border-border" data-testid="section-faq">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">Frequently Asked</span> Questions
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>
        <Accordion type="single" collapsible className="space-y-3">
          {items.map((item) => (
            <AccordionItem
              key={item.id}
              value={String(item.id)}
              className="bg-white rounded-xl border border-gray-100 px-6 shadow-sm"
              data-testid={`faq-item-${item.id}`}
            >
              <AccordionTrigger
                className="font-bold text-foreground text-left hover:no-underline"
                onClick={() => trackFaqOpened(item.question)}
              >
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
