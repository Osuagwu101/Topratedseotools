import { useListProducts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SiGrammarly, SiNordvpn, SiOpenai, SiCapcut, SiSemrush } from "react-icons/si";

function getIconForProduct(name: string) {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return <SiGrammarly className="w-8 h-8 text-[#11A683]" />;
  if (n.includes("chatgpt")) return <SiOpenai className="w-8 h-8 text-[#10A37F]" />;
  if (n.includes("nordvpn")) return <SiNordvpn className="w-8 h-8 text-[#4687FF]" />;
  if (n.includes("capcut")) return <SiCapcut className="w-8 h-8 text-white" />;
  if (n.includes("semrush")) return <SiSemrush className="w-8 h-8 text-[#FF642D]" />;
  return <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">{name[0]}</div>;
}

export default function Home() {
  const { data: products, isLoading } = useListProducts();

  return (
    <Layout>
      <section className="relative pt-24 pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent" />
        <div className="container mx-auto px-4 md:px-6 relative z-10 text-center max-w-4xl">
          <Badge variant="outline" className="mb-6 border-primary/30 text-primary bg-primary/10 px-4 py-1.5 rounded-full text-sm font-medium tracking-wide">
            Premium Tools, Nigerian Prices
          </Badge>
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 text-balance text-foreground leading-[1.1]">
            Unlock your <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-accent">productivity</span> without breaking the bank.
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Shared, affordable access to the world's best AI and productivity tools. Join thousands of students and professionals scaling their work today.
          </p>
          <div className="flex gap-4 justify-center">
            <Button size="lg" className="rounded-full px-8 h-14 text-base font-semibold shadow-[0_0_40px_8px_rgba(139,92,246,0.3)] hover:shadow-[0_0_60px_12px_rgba(139,92,246,0.4)] transition-all bg-primary hover:bg-primary/90 text-white" data-testid="button-browse-tools">
              <a href="#catalog">Browse Tools</a>
            </Button>
          </div>
        </div>
      </section>

      <section id="catalog" className="container mx-auto px-4 md:px-6 py-24">
        <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
          <div>
            <h2 className="text-3xl font-bold tracking-tight mb-2">Available Subscriptions</h2>
            <p className="text-muted-foreground">Instant access delivered to your email.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[300px] rounded-2xl bg-card border border-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products?.map((product) => (
              <Link key={product.id} href={`/products/${product.id}`} data-testid={`link-product-${product.id}`}>
                <Card className="h-full border-white/10 bg-card/40 backdrop-blur-sm hover:bg-card/80 transition-all duration-300 hover:border-primary/50 group cursor-pointer overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardHeader className="flex flex-row items-center gap-4 pb-2 relative z-10">
                    <div className="p-3 rounded-xl bg-background border border-white/10 shadow-inner">
                      {getIconForProduct(product.name)}
                    </div>
                    <div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">{product.name}</CardTitle>
                      <div className="text-sm text-muted-foreground capitalize">{product.category}</div>
                    </div>
                    {product.popular && (
                      <Badge className="ml-auto bg-accent/20 text-accent hover:bg-accent/30 border-none rounded-full px-3">
                        Hot
                      </Badge>
                    )}
                  </CardHeader>
                  <CardContent className="relative z-10">
                    <p className="text-muted-foreground text-sm line-clamp-2 mt-2">{product.description}</p>
                    <div className="mt-6 flex items-baseline gap-1">
                      <span className="text-3xl font-bold tracking-tight">₦{(product.priceKobo / 100).toLocaleString()}</span>
                      <span className="text-muted-foreground text-sm font-medium">/{product.billingPeriod === 'monthly' ? 'mo' : 'check'}</span>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 border-t border-white/5 mt-auto relative z-10">
                    <span className="text-primary font-medium text-sm group-hover:underline underline-offset-4 flex items-center gap-1">
                      View Details 
                      <span className="group-hover:translate-x-1 transition-transform inline-block">→</span>
                    </span>
                  </CardFooter>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
