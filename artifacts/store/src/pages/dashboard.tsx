import { useUser, useClerk, Show } from "@clerk/react";
import { useGetMyOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  Clock,
  XCircle,
  ShoppingBag,
  LogOut,
  ChevronRight,
} from "lucide-react";

const LOGOS: Record<string, string> = {
  grammarly: "/logos/grammarly.png",
  quillbot: "/logos/quillbot.png",
  phrasly: "/logos/phrasly2.png",
  chatgpt: "/logos/chatgpt.png",
  stealthwriter: "/logos/stealthwriter.png",
  nordvpn: "/logos/nordvpn.png",
  semrush: "/logos/semrush.png",
  capcut: "/logos/capcut.png",
  turnitin: "/logos/turnitin.png",
};

const BG_COLORS: Record<string, string> = {
  grammarly: "#E8FFF3",
  quillbot: "#EEF4FF",
  phrasly: "#FFF4EC",
  chatgpt: "#F0FDF4",
  stealthwriter: "#F3F0FF",
  nordvpn: "#E8F0FF",
  semrush: "#FFF7E8",
  capcut: "#F0F0F0",
  turnitin: "#FFF0F0",
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
  return "";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Active
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">
        <Clock className="w-3.5 h-3.5" />
        Pending
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">
      <XCircle className="w-3.5 h-3.5" />
      Failed
    </span>
  );
}

export default function Dashboard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: orders, isLoading } = useGetMyOrders();

  const activeOrders = orders?.filter((o) => o.status === "success") ?? [];
  const pendingOrders = orders?.filter((o) => o.status !== "success") ?? [];

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground uppercase">
              My <span className="text-primary">Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1 font-medium">
              Welcome back, <span className="text-foreground font-semibold">{user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "there"}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/">
              <Button variant="outline" className="border-gray-200 font-semibold text-sm h-10">
                Browse Tools
              </Button>
            </Link>
            <Button
              variant="ghost"
              className="text-sm font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 h-10 gap-1.5"
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-2xl" />
            ))}
          </div>
        ) : orders?.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
              <ShoppingBag className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-heading font-bold text-foreground uppercase mb-2">
              No Subscriptions Yet
            </h2>
            <p className="text-muted-foreground mb-8 max-w-sm">
              You haven't purchased any tool subscriptions yet. Browse our catalog and get started.
            </p>
            <Link href="/">
              <Button className="bg-primary hover:bg-primary/90 text-white font-bold px-8 h-12 rounded-xl uppercase tracking-widest">
                Browse Tools
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {activeOrders.length > 0 && (
              <section>
                <h2 className="text-lg font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                  Active Subscriptions
                  <span className="ml-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                    {activeOrders.length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {activeOrders.map((order) => {
                    const key = getLogoKey(order.productName);
                    return (
                      <div
                        key={order.id}
                        className="bg-white border-2 border-primary/20 rounded-2xl p-5 flex items-center gap-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all"
                      >
                        <div
                          className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center p-2"
                          style={{ backgroundColor: BG_COLORS[key] ?? "#F7F8FA" }}
                        >
                          {LOGOS[key] ? (
                            <img
                              src={LOGOS[key]}
                              alt={order.productName}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <span className="text-xl font-heading font-bold text-primary">
                              {order.productName[0]}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-foreground truncate">{order.productName}</h3>
                            <StatusBadge status={order.status} />
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-primary font-bold">
                              ₦{(order.amountKobo / 100).toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground uppercase font-semibold">
                              / {order.billingPeriod === "monthly" ? "month" : "check"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(order.createdAt).toLocaleDateString("en-NG", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {pendingOrders.length > 0 && (
              <section>
                <h2 className="text-lg font-bold uppercase tracking-wider text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-yellow-500" />
                  Pending / Failed Orders
                  <span className="ml-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">
                    {pendingOrders.length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingOrders.map((order) => {
                    const key = getLogoKey(order.productName);
                    return (
                      <div
                        key={order.id}
                        className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 opacity-80"
                      >
                        <div
                          className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center p-2 grayscale opacity-60"
                          style={{ backgroundColor: BG_COLORS[key] ?? "#F7F8FA" }}
                        >
                          {LOGOS[key] ? (
                            <img
                              src={LOGOS[key]}
                              alt={order.productName}
                              className="max-w-full max-h-full object-contain"
                            />
                          ) : (
                            <span className="text-xl font-heading font-bold text-primary">
                              {order.productName[0]}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-bold text-foreground truncate">{order.productName}</h3>
                            <StatusBadge status={order.status} />
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className="text-muted-foreground font-bold">
                              ₦{(order.amountKobo / 100).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{order.reference}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="pt-4 border-t border-gray-100">
              <Link href="/" className="inline-flex items-center gap-2 text-sm text-primary font-bold hover:underline">
                Browse more tools
                <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
