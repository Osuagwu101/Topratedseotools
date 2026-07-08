import { useListProducts } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@clerk/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const LOGOS: Record<string, string> = {
  grammarly:     "/logos/grammarly.png",
  quillbot:      "/logos/quillbot.png",
  phrasly:       "/logos/phrasly2.png",
  chatgpt:       "/logos/chatgpt.png",
  stealthwriter: "/logos/stealthwriter.png",
  nordvpn:       "/logos/nordvpn.png",
  semrush:       "/logos/semrush.png",
  capcut:        "/logos/capcut.png",
  turnitin:      "/logos/turnitin.png",
  writehuman:    "/logos/writehuman.png",
};

const BG_COLORS: Record<string, string> = {
  grammarly:     "#E8FFF3",
  quillbot:      "#EEF4FF",
  phrasly:       "#FFF4EC",
  chatgpt:       "#F0FDF4",
  stealthwriter: "#F3F0FF",
  nordvpn:       "#E8F0FF",
  semrush:       "#FFF7E8",
  capcut:        "#F0F0F0",
  turnitin:      "#FFF0F0",
  writehuman:    "#F0FFF8",
};

function getLogoKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("grammarly")) return "grammarly";
  if (n.includes("quillbot")) return "quillbot";
  if (n.includes("phrasly")) return "phrasly";
  if (n.includes("chatgpt")) return "chatgpt";
  if (n.includes("stealth")) return "stealthwriter";
  if (n.includes("nord")) return "nordvpn";
  if (n.includes("semrush")) return "semrush";
  if (n.includes("capcut")) return "capcut";
  if (n.includes("turnitin")) return "turnitin";
  if (n.includes("writehuman") || n.includes("write human")) return "writehuman";
  return "";
}

export default function Home() {
  const { data: products, isLoading } = useListProducts();
  const { isSignedIn } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <Layout>
      <section className="pt-20 pb-16 bg-white border-b border-border shadow-sm text-center">
        <div className="container mx-auto px-4 md:px-6 max-w-5xl">
          <h1 className="text-4xl md:text-6xl font-heading tracking-tight mb-6 text-foreground leading-[1.2] uppercase">
            TOP RATED <span className="text-primary">SEO</span> <span className="text-accent">TOOLS</span>
          </h1>
          <p className="text-base md:text-lg font-heading text-primary mb-3 tracking-wide">
            The Vendor You Can Count On!
          </p>
          <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto font-medium">
            Shared, affordable access to the world's best AI and productivity tools. Join thousands of students and professionals scaling their work today.
          </p>
          <Button
            size="lg"
            className="rounded-xl px-10 h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white uppercase tracking-widest shadow-md hover:shadow-lg transition-all"
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
            <span className="text-primary">Choose Your</span> Tool
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <Skeleton key={i} className="h-[340px] rounded-2xl bg-gray-100" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products?.map((product) => {
              const key = getLogoKey(product.name);
              const logoSrc = LOGOS[key] ?? "";
              const bgColor = BG_COLORS[key] ?? "#F7F8FA";

              return (
                <div
                  key={product.id}
                  className="bg-white border-2 border-gray-100 hover:border-primary/60 shadow-sm hover:shadow-lg transition-all duration-300 rounded-2xl overflow-hidden flex flex-col group"
                >
                  <div
                    className="h-40 flex items-center justify-center p-6"
                    style={{ backgroundColor: bgColor }}
                  >
                    {logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={product.name + " logo"}
                        className="max-h-20 max-w-[160px] w-auto h-auto object-contain drop-shadow-sm"
                      />
                    ) : (
                      <span className="text-4xl font-heading font-bold text-primary">
                        {product.name[0]}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col flex-grow px-5 pt-4 pb-5 text-center">
                    <h3 className="text-lg font-bold font-sans text-foreground mb-1">
                      {product.name}
                    </h3>
                    <span className="text-xs font-bold text-accent uppercase tracking-widest mb-3 bg-accent/10 py-0.5 px-2 rounded-full inline-block mx-auto">
                      {product.category}
                    </span>

                    <div className="mt-auto mb-4">
                      <span className="text-3xl font-heading text-primary font-bold">
                        ₦{(product.priceKobo / 100).toLocaleString()}
                      </span>
                      <span className="text-xs text-muted-foreground font-semibold uppercase tracking-widest block mt-0.5">
                        / {product.billingPeriod === "monthly" ? "month" : "check"}
                      </span>
                    </div>

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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </Layout>
  );
}
