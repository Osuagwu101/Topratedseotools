import { useListProducts } from "@workspace/api-client-react";
import { LOGOS, getLogoKey } from "@/components/tool-card";

export function TrustStrip() {
  const { data: products } = useListProducts();

  const logos = (products || [])
    .map((p) => ({ name: p.name, key: getLogoKey(p.name), src: p.imageUrl || LOGOS[getLogoKey(p.name)] }))
    .filter((l) => !!l.src)
    .slice(0, 8);

  if (logos.length === 0) return null;

  return (
    <section className="py-10 bg-white border-t border-border" data-testid="section-trust-strip">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-muted-foreground mb-6">
          Access to the tools you already trust
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 opacity-80">
          {logos.map((logo) => (
            <img
              key={logo.name}
              src={logo.src}
              alt={`${logo.name} logo`}
              className="h-7 md:h-8 w-auto max-w-[120px] object-contain grayscale hover:grayscale-0 transition-all"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
