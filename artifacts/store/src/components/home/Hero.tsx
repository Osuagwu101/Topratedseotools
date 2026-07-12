import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/context/siteSettings";
import { ShieldCheck } from "lucide-react";
import { trackBrowseToolsClicked } from "@/lib/analytics";

export function Hero() {
  const { settings } = useSiteSettings();

  return (
    <section className="relative pt-20 pb-16 md:pb-24 bg-white border-b border-border overflow-hidden">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="text-center lg:text-left">
          <h1 className="text-4xl md:text-6xl font-heading font-bold tracking-tight mb-6 text-foreground leading-[1.15]">
            {settings.siteHeadline}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto lg:mx-0 font-medium">
            {settings.siteSubheadline}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6">
            <Link href="/catalog">
              <Button
                size="lg"
                className="rounded-lg px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all"
                data-testid="button-browse-tools"
                onClick={() => trackBrowseToolsClicked("hero")}
              >
                {settings.heroPrimaryButtonText}
              </Button>
            </Link>
            {settings.heroSecondaryButtonText && (
              <a href="#popular-tools">
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-lg px-10 h-14 text-lg font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all"
                  data-testid="button-hero-secondary"
                >
                  {settings.heroSecondaryButtonText}
                </Button>
              </a>
            )}
          </div>
          {settings.heroTrustLine && (
            <p className="flex items-center justify-center lg:justify-start gap-2 text-sm text-muted-foreground font-medium">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              {settings.heroTrustLine}
            </p>
          )}
        </div>
        {settings.heroImageUrl && (
          <div className="hidden lg:block">
            <img
              src={settings.heroImageUrl}
              alt="Top Rated SEO Tools"
              className="w-full h-auto rounded-2xl shadow-xl object-cover max-h-[420px]"
            />
          </div>
        )}
      </div>
    </section>
  );
}
