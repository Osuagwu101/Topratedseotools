import { useGetProduct } from "@workspace/api-client-react";
import { Link, useRoute } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Check } from "lucide-react";
import { SiGrammarly, SiNordvpn, SiOpenai, SiCapcut, SiSemrush } from "react-icons/si";

function getIconForProduct(name: string) {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return <SiGrammarly className="w-12 h-12 text-[#11A683]" />;
  if (n.includes("chatgpt")) return <SiOpenai className="w-12 h-12 text-[#10A37F]" />;
  if (n.includes("nordvpn")) return <SiNordvpn className="w-12 h-12 text-[#4687FF]" />;
  if (n.includes("capcut")) return <SiCapcut className="w-12 h-12 text-white" />;
  if (n.includes("semrush")) return <SiSemrush className="w-12 h-12 text-[#FF642D]" />;
  return <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-2xl">{name[0]}</div>;
}

export default function ProductDetail() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ? parseInt(params.id, 10) : 0;
  
  const { data: product, isLoading } = useGetProduct(productId, {
    query: { enabled: !!productId }
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 max-w-5xl">
          <Skeleton className="h-[400px] rounded-3xl" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-3xl font-bold mb-4">Product not found</h1>
          <Link href="/">
            <Button variant="outline">Back to Catalog</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-5xl">
        <Link href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 mb-12 text-sm font-medium transition-colors" data-testid="link-back">
          ← Back to Catalog
        </Link>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <div className="p-6 rounded-2xl bg-card border border-white/10 shadow-xl shadow-black/50 inline-block mb-8">
              {getIconForProduct(product.name)}
            </div>
            <div className="flex items-center gap-3 mb-4">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">{product.name}</h1>
              {product.popular && (
                <Badge className="bg-accent/20 text-accent hover:bg-accent/30 border-none rounded-full px-3 py-1">Hot</Badge>
              )}
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed mb-8">
              {product.description}
            </p>
            
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">What's included:</h3>
              <ul className="space-y-3">
                {product.features?.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-muted-foreground">
                    <div className="mt-1 rounded-full bg-primary/20 p-1">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span>{feature}</span>
                  </li>
                ))}
                {!product.features?.length && (
                  <li className="flex items-start gap-3 text-muted-foreground">
                    <div className="mt-1 rounded-full bg-primary/20 p-1">
                      <Check className="w-3 h-3 text-primary" />
                    </div>
                    <span>Full access to all premium features</span>
                  </li>
                )}
                <li className="flex items-start gap-3 text-muted-foreground">
                  <div className="mt-1 rounded-full bg-primary/20 p-1">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  <span>Instant delivery via email</span>
                </li>
              </ul>
            </div>
          </div>
          
          <div className="sticky top-32 p-8 rounded-3xl bg-card border border-white/10 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="relative z-10">
              <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">Subscription Plan</div>
              <div className="flex items-end gap-2 mb-6">
                <span className="text-5xl font-bold tracking-tight text-foreground">₦{(product.priceKobo / 100).toLocaleString()}</span>
                <span className="text-lg text-muted-foreground mb-1 font-medium">/{product.billingPeriod === 'monthly' ? 'month' : 'check'}</span>
              </div>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between py-3 border-b border-white/10 text-sm">
                  <span className="text-muted-foreground">Billing Cycle</span>
                  <span className="font-medium capitalize">{product.billingPeriod.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-white/10 text-sm">
                  <span className="text-muted-foreground">Payment Method</span>
                  <span className="font-medium">Paystack (Card, Transfer, USSD)</span>
                </div>
              </div>
              
              <Link href={`/checkout?productId=${product.id}`}>
                <Button className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-white rounded-xl shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all" data-testid="button-subscribe">
                  Subscribe Now
                </Button>
              </Link>
              <p className="text-center text-xs text-muted-foreground mt-4">
                Secure checkout powered by Paystack.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
