import { useGetProduct, getGetProductQueryKey, useListProducts } from "@workspace/api-client-react";
import { Link, useRoute, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SiGrammarly, SiNordvpn, SiSemrush } from "react-icons/si";
import { Check, Video, Bot, Shield, Pencil } from "lucide-react";
import { ToolCard } from "@/components/tool-card";

function RecommendationRow({
  title,
  subtitle,
  ids,
  allProducts,
}: {
  title: string;
  subtitle: string;
  ids: number[] | undefined;
  allProducts: Array<{ id: number; name: string; category?: string | null; imageUrl?: string | null; priceKobo: number; billingPeriod: string }> | undefined;
}) {
  if (!ids?.length || !allProducts) return null;
  const items = ids
    .map((id) => allProducts.find((p) => p.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p);
  if (!items.length) return null;

  return (
    <div className="mt-12">
      <h3 className="font-heading text-2xl uppercase border-b border-border pb-4 mb-6">{title}</h3>
      <p className="text-muted-foreground text-sm font-semibold mb-6 -mt-4">{subtitle}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((p) => (
          <Link key={p.id} href={`/products/${p.id}`}>
            <ToolCard
              name={p.name}
              category={p.category}
              imageUrl={p.imageUrl}
              priceKobo={p.priceKobo}
              billingPeriod={p.billingPeriod}
              footer={
                <span className="text-sm font-bold text-primary uppercase tracking-wider">
                  View tool →
                </span>
              }
              testId={`recommendation-${p.id}`}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}

function getIconForProduct(name: string) {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return <SiGrammarly className="w-20 h-20 text-white" />;
  if (n.includes("chatgpt")) return <Bot className="w-20 h-20 text-white" />;
  if (n.includes("nordvpn")) return <SiNordvpn className="w-20 h-20 text-white" />;
  if (n.includes("capcut")) return <Video className="w-20 h-20 text-white" />;
  if (n.includes("semrush")) return <SiSemrush className="w-20 h-20 text-white" />;
  if (n.includes("stealth") || n.includes("writehuman") || n.includes("write human")) return <Shield className="w-20 h-20 text-white" />;
  if (n.includes("jenni")) return <Pencil className="w-20 h-20 text-white" />;
  if (n.includes("quill") || n.includes("phrasly") || n.includes("turnitin")) return <Pencil className="w-20 h-20 text-white" />;
  return <div className="w-20 h-20 flex items-center justify-center text-white font-heading text-5xl">{name[0]}</div>;
}

function getGradientForProduct(name: string) {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return "from-teal-400 to-emerald-500";
  if (n.includes("chatgpt")) return "from-green-500 to-emerald-600";
  if (n.includes("nordvpn")) return "from-blue-500 to-blue-700";
  if (n.includes("capcut")) return "from-gray-800 to-gray-900";
  if (n.includes("semrush")) return "from-orange-400 to-red-500";
  if (n.includes("stealth")) return "from-purple-500 to-indigo-600";
  if (n.includes("writehuman") || n.includes("write human")) return "from-emerald-400 to-teal-600";
  if (n.includes("jenni")) return "from-purple-400 to-pink-500";
  if (n.includes("quill") || n.includes("phrasly") || n.includes("turnitin")) return "from-blue-400 to-indigo-500";
  return "from-primary to-green-600";
}

export default function ProductDetail() {
  const [, params] = useRoute("/products/:id");
  const productId = params?.id ? parseInt(params.id, 10) : 0;
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  const { data: product, isLoading } = useGetProduct(productId, {
    query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId) }
  });
  const { data: allProducts } = useListProducts();

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 max-w-5xl">
          <Skeleton className="h-[500px] rounded-3xl bg-white shadow-md border border-border" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-3xl font-heading mb-6 text-foreground uppercase">Product not found</h1>
          <Link href="/">
            <Button variant="outline" className="font-bold border-2 rounded-xl h-12 px-8 uppercase tracking-wider">Back to Catalog</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 md:py-16 max-w-5xl">
        <Link href="/" className="text-primary hover:text-primary/80 inline-flex items-center gap-2 mb-8 text-sm font-bold uppercase tracking-wider transition-colors" data-testid="link-back">
          ← Back to Catalog
        </Link>
        
        <div className="bg-white rounded-3xl shadow-lg border border-border overflow-hidden">
          <div className={`h-48 md:h-64 bg-gradient-to-br ${getGradientForProduct(product.name)} flex items-center justify-center relative`}>
            <div className="absolute inset-0 bg-black/10"></div>
            <div className="relative z-10 drop-shadow-xl">
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt={`${product.name} logo`}
                  className="w-32 h-32 object-contain"
                />
              ) : (
                getIconForProduct(product.name)
              )}
            </div>
          </div>
          
          <div className="p-8 md:p-12 grid grid-cols-1 lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <h1 className="text-4xl md:text-5xl font-heading tracking-tight text-foreground uppercase mb-3">{product.name}</h1>
              <div className="text-xs font-bold text-accent uppercase tracking-widest mb-8 bg-accent/10 py-1.5 px-4 rounded-full inline-block">{product.category}</div>
              
              <p className="text-lg text-muted-foreground leading-relaxed mb-12 font-medium whitespace-pre-line">
                {product.fullDescription || product.description}
              </p>
              
              <div className="space-y-6">
                <h3 className="font-heading text-2xl uppercase border-b border-border pb-4">Features included</h3>
                <ul className="space-y-4 pt-2">
                  {product.features?.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-4">
                      <div className="mt-1 flex-shrink-0 bg-primary/10 p-1 rounded-full">
                        <Check className="w-5 h-5 text-primary" strokeWidth={3} />
                      </div>
                      <span className="text-foreground font-semibold text-lg">{feature}</span>
                    </li>
                  ))}
                  {!product.features?.length && (
                    <li className="flex items-start gap-4">
                      <div className="mt-1 flex-shrink-0 bg-primary/10 p-1 rounded-full">
                        <Check className="w-5 h-5 text-primary" strokeWidth={3} />
                      </div>
                      <span className="text-foreground font-semibold text-lg">Full premium access</span>
                    </li>
                  )}
                  <li className="flex items-start gap-4">
                    <div className="mt-1 flex-shrink-0 bg-primary/10 p-1 rounded-full">
                      <Check className="w-5 h-5 text-primary" strokeWidth={3} />
                    </div>
                    <span className="text-foreground font-semibold text-lg">Instant delivery to your email</span>
                  </li>
                </ul>
              </div>
            </div>
            
            <div className="lg:col-span-1">
              <div className="bg-[#F7F8F9] p-8 rounded-2xl border-2 border-primary/20 text-center sticky top-24 shadow-sm">
                <div className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-2">Price</div>
                <div className="mb-6">
                  <span className="text-5xl font-heading text-primary">₦{(product.priceKobo / 100).toLocaleString()}</span>
                  <div className="text-muted-foreground font-bold uppercase tracking-widest mt-2">/ {product.billingPeriod === 'monthly' ? 'month' : 'check'}</div>
                </div>
                
                <div className="space-y-4 text-left mb-8 font-semibold text-sm">
                  <div className="flex justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Cycle</span>
                    <span className="capitalize">{product.billingPeriod.replace('_', ' ')}</span>
                  </div>
                  <div className="flex justify-between py-3 border-b border-border">
                    <span className="text-muted-foreground">Payment</span>
                    <span>Paystack</span>
                  </div>
                </div>
                
                <Button
                  className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white rounded-xl uppercase tracking-wider shadow-md hover:shadow-lg transition-all"
                  data-testid="button-subscribe"
                  onClick={() => {
                    if (isSignedIn) {
                      setLocation(`/checkout?productId=${product.id}`);
                    } else {
                      setLocation(`/sign-in`);
                    }
                  }}
                >
                  Buy Now
                </Button>
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-6 flex items-center justify-center gap-2">
                   Secured by Paystack
                </div>
              </div>
            </div>
          </div>

          <div className="px-8 md:px-12 pb-12">
            <RecommendationRow
              title="You may also like"
              subtitle="Tools that pair well with this one"
              ids={product.crossSellProductIds}
              allProducts={allProducts}
            />
            <RecommendationRow
              title="Upgrade to"
              subtitle="Want more power? Consider these instead"
              ids={product.upSellProductIds}
              allProducts={allProducts}
            />
            <RecommendationRow
              title="Or try instead"
              subtitle="Lighter, more affordable options"
              ids={product.downSellProductIds}
              allProducts={allProducts}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
