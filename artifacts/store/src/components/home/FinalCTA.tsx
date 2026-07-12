import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/context/siteSettings";
import { trackBrowseToolsClicked } from "@/lib/analytics";

export function FinalCTA() {
  const { settings } = useSiteSettings();

  return (
    <section className="py-20 bg-primary text-white" data-testid="section-final-cta">
      <div className="container mx-auto px-4 md:px-6 max-w-3xl text-center">
        <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase">
          {settings.finalCtaHeadline}
        </h2>
        {settings.finalCtaSubtext && (
          <p className="text-white/85 max-w-xl mx-auto mb-8 leading-relaxed">
            {settings.finalCtaSubtext}
          </p>
        )}
        <Link href="/catalog">
          <Button
            size="lg"
            className="rounded-lg px-10 h-14 text-lg font-bold bg-white text-primary hover:bg-white/90 shadow-md hover:shadow-lg transition-all"
            data-testid="button-final-cta"
            onClick={() => trackBrowseToolsClicked("final_cta")}
          >
            {settings.finalCtaButtonText}
          </Button>
        </Link>
      </div>
    </section>
  );
}
