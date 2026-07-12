import { useMemo } from "react";
import { useListProducts } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolCard } from "@/components/tool-card";
import { ArrowRight } from "lucide-react";

export function PopularTools() {
  const { data: products, isLoading } = useListProducts();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  const featured = useMemo(() => {
    if (!products) return [];
    return products
      .filter((p) => p.featuredOrder !== null && p.featuredOrder !== undefined)
      .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0))
      .slice(0, 6);
  }, [products]);

  // Fall back to the first few visible tools if the admin hasn't curated any yet,
  // so the section is never empty.
  const displayed = featured.length > 0 ? featured : (products || []).slice(0, 4);

  if (!isLoading && displayed.length === 0) return null;

  return (
    <section id="popular-tools" className="py-20 bg-[#F7F8F9] border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">Popular</span> Tools
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-[340px] rounded-lg bg-gray-200" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {displayed.map((product) => (
              <ToolCard
                key={product.id}
                name={product.name}
                category={product.category}
                imageUrl={product.imageUrl}
                priceKobo={product.priceKobo}
                billingPeriod={product.billingPeriod}
                testId={`card-popular-${product.id}`}
                footer={
                  <Button
                    className="w-full h-11 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg uppercase tracking-widest shadow-sm group-hover:shadow-md transition-all"
                    data-testid={`link-popular-${product.id}`}
                    onClick={() => setLocation(isSignedIn ? `/products/${product.id}` : "/sign-in")}
                  >
                    Buy Now
                  </Button>
                }
              />
            ))}
          </div>
        )}

        <div className="text-center mt-12">
          <Link href="/catalog">
            <Button
              variant="outline"
              size="lg"
              className="rounded-lg px-8 h-12 font-bold border-2 border-primary text-primary hover:bg-primary hover:text-white transition-all"
              data-testid="button-browse-all-tools"
            >
              Browse All Tools
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
