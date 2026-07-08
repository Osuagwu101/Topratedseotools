import { useListProducts } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SiGrammarly, SiNordvpn, SiSemrush } from "react-icons/si";
import { Video, Bot, Shield, Pencil } from "lucide-react";

function getIconForProduct(name: string) {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return <SiGrammarly className="w-12 h-12 text-white" />;
  if (n.includes("chatgpt")) return <Bot className="w-12 h-12 text-white" />;
  if (n.includes("nordvpn")) return <SiNordvpn className="w-12 h-12 text-white" />;
  if (n.includes("capcut")) return <Video className="w-12 h-12 text-white" />;
  if (n.includes("semrush")) return <SiSemrush className="w-12 h-12 text-white" />;
  if (n.includes("stealth")) return <Shield className="w-12 h-12 text-white" />;
  if (n.includes("quill") || n.includes("phrasly") || n.includes("turnitin")) return <Pencil className="w-12 h-12 text-white" />;
  return <div className="w-12 h-12 flex items-center justify-center text-white font-heading text-3xl">{name[0]}</div>;
}

function getGradientForProduct(name: string) {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return "from-teal-400 to-emerald-500";
  if (n.includes("chatgpt")) return "from-green-500 to-emerald-600";
  if (n.includes("nordvpn")) return "from-blue-500 to-blue-700";
  if (n.includes("capcut")) return "from-gray-800 to-gray-900";
  if (n.includes("semrush")) return "from-orange-400 to-red-500";
  if (n.includes("stealth")) return "from-purple-500 to-indigo-600";
  if (n.includes("quill") || n.includes("phrasly") || n.includes("turnitin")) return "from-blue-400 to-indigo-500";
  return "from-primary to-green-600";
}

export default function Home() {
  const { data: products, isLoading } = useListProducts();

  return (
    <Layout>
      <section className="pt-20 pb-16 bg-white border-b border-border shadow-sm text-center">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-heading tracking-tight mb-6 text-foreground leading-[1.2] uppercase">
            PREMIUM <span className="text-primary">GROUP BUY</span> <span className="text-accent">SEO TOOLS</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-medium">
            Shared, affordable access to the world's best AI and productivity tools. Join thousands of students and professionals scaling their work today.
          </p>
          <Button size="lg" className="rounded-xl px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white uppercase tracking-widest shadow-md hover:shadow-lg transition-all" data-testid="button-browse-tools">
            <a href="#catalog">Browse Tools</a>
          </Button>
        </div>
      </section>

      <section id="catalog" className="container mx-auto px-4 md:px-6 py-20">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">Choose Your</span> Tool
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <Skeleton key={i} className="h-[400px] rounded-2xl bg-white border border-border shadow-sm" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {products?.map((product) => (
              <Card key={product.id} className="h-full bg-white border-2 border-transparent hover:border-primary/50 shadow-md hover:shadow-xl transition-all duration-300 rounded-2xl overflow-hidden flex flex-col group relative">
                <div className={`h-36 bg-gradient-to-br ${getGradientForProduct(product.name)} flex items-center justify-center`}>
                   {getIconForProduct(product.name)}
                </div>
                
                <CardHeader className="text-center pb-2 pt-6">
                  <CardTitle className="text-2xl font-bold font-sans text-foreground uppercase tracking-tight">{product.name}</CardTitle>
                  <div className="text-xs font-bold text-accent uppercase tracking-widest mt-2 bg-accent/10 py-1 px-3 rounded-full inline-block mx-auto">{product.category}</div>
                </CardHeader>
                
                <CardContent className="text-center pb-6 pt-2 flex-grow flex flex-col justify-end">
                  <div className="mt-4 flex flex-col items-center justify-center">
                    <span className="text-4xl font-heading text-primary mb-1">
                      ₦{(product.priceKobo / 100).toLocaleString()}
                    </span>
                    <span className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
                      / {product.billingPeriod === 'monthly' ? 'month' : 'check'}
                    </span>
                  </div>
                </CardContent>
                
                <CardFooter className="pt-0 pb-6 px-6">
                  <Link href={`/products/${product.id}`} className="w-full" data-testid={`link-product-${product.id}`}>
                    <Button className="w-full h-12 text-base font-bold bg-primary hover:bg-primary/90 text-white rounded-lg uppercase tracking-widest shadow-sm group-hover:shadow-md transition-all">
                      Buy Now
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>
    </Layout>
  );
}
