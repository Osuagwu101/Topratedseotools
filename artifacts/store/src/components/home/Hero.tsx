import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useSiteSettings } from "@/context/siteSettings";
import { ShieldCheck } from "lucide-react";
import { trackBrowseToolsClicked } from "@/lib/analytics";

const isExternalOrAnchorLink = (href: string) => /^(https?:\/\/|#|mailto:|tel:)/.test(href);

export function Hero() {
  const { settings } = useSiteSettings();
  const primaryHref = settings.heroPrimaryButtonLink?.trim() || "/catalog";
  const secondaryHref = settings.heroSecondaryButtonLink?.trim() || "#popular-tools";

  return (
    <section className="bg-white border-b border-border py-16 md:py-24">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-3xl mx-auto text-center space-y-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold tracking-tight text-foreground">
            {settings.siteHeadline}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
            {settings.siteSubheadline}
          </p>

          <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
            {isExternalOrAnchorLink(primaryHref) ? (
              <a href={primaryHref}>
                <Button
                  size="lg"
                  className="rounded-lg px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all"
                  data-testid="button-browse-tools"
                  onClick={() => trackBrowseToolsClicked("hero")}
                >
                  {settings.heroPrimaryButtonText}
                </Button>
              </a>
            ) : (
              <Link href={primaryHref}>
                <Button
                  size="lg"
                  className="rounded-lg px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all"
                  data-testid="button-browse-tools"
                  onClick={() => trackBrowseToolsClicked("hero")}
                >
                  {settings.heroPrimaryButtonText}
                </Button>
              </Link>
            )}
            {settings.heroSecondaryButtonText && (
              isExternalOrAnchorLink(secondaryHref) ? (
                <a href={secondaryHref}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-lg px-10 h-14 text-lg font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all"
                    data-testid="button-hero-secondary"
                  >
                    {settings.heroSecondaryButtonText}
                  </Button>
                </a>
              ) : (
                <Link href={secondaryHref}>
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-lg px-10 h-14 text-lg font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all"
                    data-testid="button-hero-secondary"
                  >
                    {settings.heroSecondaryButtonText}
                  </Button>
                </Link>
              )
            )}
          </div>

          {settings.heroTrustLine && (
            <p className="pt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground font-medium">
              <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
              {settings.heroTrustLine}
            </p>
          )}

          {settings.heroImageUrl && (
            <div className="pt-8">
              <img
                src={settings.heroImageUrl}
                alt="Top Rated SEO Tools"
                className="w-full h-auto rounded-2xl shadow-xl object-cover max-h-[420px] mx-auto"
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
