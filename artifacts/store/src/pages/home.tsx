import { useMemo } from "react";
import { useListProducts } from "@workspace/api-client-react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToolCard } from "@/components/tool-card";
import { Testimonials } from "@/components/Testimonials";
import { CustomerCounter } from "@/components/CustomerCounter";
import { useSiteSettings } from "@/context/siteSettings";

export default function Home() {
  const { data: products, isLoading } = useListProducts();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const { settings } = useSiteSettings();
  const search = useSearch();
  const query = new URLSearchParams(search).get("q")?.trim() ?? "";

  const filteredProducts = useMemo(() => {
    if (!products || !query) return products;
    const q = query.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    );
  }, [products, query]);

  return (
    <Layout>
      <section className="pt-20 pb-16 bg-white border-b border-border shadow-sm text-center">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-heading font-bold tracking-tight mb-6 text-foreground leading-[1.15]">
            {settings.siteHeadline}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-medium">
            {settings.siteSubheadline}
          </p>
          <Button
            size="lg"
            className="rounded-lg px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg transition-all"
            data-testid="button-browse-tools"
            asChild
          >
            <a href="#catalog">Browse Tools</a>
          </Button>
        </div>
      </section>

      <section id="catalog" className="container mx-auto px-4 md:px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            {query ? (
              <>
                Results for <span className="text-primary">&ldquo;{query}&rdquo;</span>
              </>
            ) : (
              <>
                <span className="text-primary">Choose Your</span> Tool
              </>
            )}
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>
        <div className="mb-12">
          <CustomerCounter />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <Skeleton key={i} className="h-[340px] rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : filteredProducts && filteredProducts.length === 0 ? (
          <p className="text-center text-muted-foreground py-12">
            No tools match &ldquo;{query}&rdquo;. Try a different search.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts?.map((product) => (
              <ToolCard
                key={product.id}
                name={product.name}
                category={product.category}
                imageUrl={product.imageUrl}
                priceKobo={product.priceKobo}
                billingPeriod={product.billingPeriod}
                testId={`card-product-${product.id}`}
                footer={
                  <Button
                    className="w-full h-11 text-sm font-bold bg-primary hover:bg-primary/90 text-white rounded-lg uppercase tracking-widest shadow-sm group-hover:shadow-md transition-all"
                    data-testid={`link-product-${product.id}`}
                    onClick={() => {
                      if (isSignedIn) {
                        setLocation(`/products/${product.id}`);
                      } else {
                        setLocation(`/sign-in`);
                      }
                    }}
                  >
                    Buy Now
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </section>
      <Testimonials page="home" />
    </Layout>
  );
}
