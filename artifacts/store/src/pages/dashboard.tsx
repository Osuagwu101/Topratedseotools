import { useState } from "react";
import { useCurrency } from "@/context/currency";
import { useUser, useClerk, Show } from "@clerk/react";
import { useGetMyOrders } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  CheckCircle2,
  Clock,
  XCircle,
  ShoppingBag,
  LogOut,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ToolCard, LOGOS, BG_COLORS, getLogoKey } from "@/components/tool-card";

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
  if (status === "expired") {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-gray-200 text-gray-600">
        <XCircle className="w-3.5 h-3.5" />
        Expired
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

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="ml-1 p-1 rounded-md hover:bg-gray-100 transition-colors text-gray-400 hover:text-primary"
      title="Copy"
    >
      <Copy className="w-3.5 h-3.5" />
      {copied && <span className="sr-only">Copied!</span>}
    </button>
  );
}

function CredentialBox({
  username,
  password,
}: {
  username: string | null | undefined;
  password: string | null | undefined;
}) {
  const [showPass, setShowPass] = useState(false);
  if (!username && !password) return null;

  return (
    <div className="mt-3 bg-gray-50 border border-gray-100 rounded-xl p-3 space-y-2">
      {username && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 w-16 flex-shrink-0">
            Email
          </span>
          <span className="text-xs font-mono text-foreground flex-1 truncate">{username}</span>
          <CopyButton value={username} />
        </div>
      )}
      {password && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400 w-16 flex-shrink-0">
            Password
          </span>
          <span className="text-xs font-mono text-foreground flex-1 truncate">
            {showPass ? password : "•".repeat(Math.min(password.length, 12))}
          </span>
          <button
            onClick={() => setShowPass((v) => !v)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors"
            title={showPass ? "Hide" : "Show"}
          >
            {showPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <CopyButton value={password} />
        </div>
      )}
    </div>
  );
}

function TransactionPrice({ amountKobo }: { amountKobo: number }) {
  const { formatPrice, currency } = useCurrency();
  return (
    <>
      {formatPrice(amountKobo)}
      {currency.code !== "NGN" && <span className="ml-1 text-xs text-gray-400">(est.)</span>}
    </>
  );
}

function TransactionRow({
  order,
}: {
  order: {
    id: number;
    productId: number;
    productName: string;
    amountKobo: number;
    status: string;
    reference: string;
  };
}) {
  const key = getLogoKey(order.productName);
  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 flex items-center gap-4 opacity-80">
      <div
        className="w-14 h-14 rounded-xl flex-shrink-0 flex items-center justify-center p-2 grayscale opacity-60"
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
          <span className="text-muted-foreground font-bold text-sm">
            <TransactionPrice amountKobo={order.amountKobo} />
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 font-mono">{order.reference}</p>
      </div>
    </div>
  );
}

const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Dashboard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { toast } = useToast();
  const basePath = BASE_PATH;

  const { data: orders, isLoading } = useGetMyOrders();

  // Successful = verified by Paystack and tool granted (still within its access window).
  // Pending = initiated but not yet confirmed either way.
  // Failed = permanently failed (cancelled, insufficient funds, expired, verification failed)
  // — never grants access. "expired" is a computed status for orders that were once
  // successful but whose entitlement window has lapsed, so it's bucketed here too since
  // it no longer grants access.
  const successfulOrders = orders?.filter((o) => o.status === "success") ?? [];
  const pendingOrders = orders?.filter((o) => o.status === "pending") ?? [];
  const failedOrders =
    orders?.filter((o) => o.status !== "success" && o.status !== "pending") ?? [];

  return (
    <Layout>
      <div className="container mx-auto px-4 md:px-6 py-12 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
          <div>
            <h1 className="text-3xl font-heading font-bold text-foreground uppercase">
              My <span className="text-primary">Dashboard</span>
            </h1>
            <p className="text-muted-foreground mt-1 font-medium">
              Welcome back,{" "}
              <span className="text-foreground font-semibold">
                {user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "there"}
              </span>
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
              <Skeleton key={i} className="h-36 rounded-2xl" />
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
            <Accordion type="multiple" className="space-y-4">
              {successfulOrders.length > 0 && (
                <AccordionItem
                  value="successful"
                  className="border border-gray-100 rounded-2xl px-5 bg-white"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <span className="flex items-center gap-2 text-lg font-bold uppercase tracking-wider text-foreground">
                      <CheckCircle2 className="w-5 h-5 text-primary" />
                      Active Tools
                      <span className="ml-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                        {successfulOrders.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pb-2">
                      {successfulOrders.map((order) => {
                        const hasAutoLogin = order.isAutoLogin === true;
                        const hasCreds = !hasAutoLogin && (order.credUsername || order.credPassword);
                        const dailyLimit = order.maxDailyInputs ?? null;
                        const dailyUsed = order.dailyUsageCount ?? 0;
                        const limitReached = dailyLimit != null && dailyUsed >= dailyLimit;
                        const remaining = dailyLimit != null ? Math.max(0, dailyLimit - dailyUsed) : null;

                        return (
                          <ToolCard
                            key={order.id}
                            name={order.productName}
                            priceKobo={order.amountKobo}
                            billingPeriod={order.billingPeriod}
                            testId={`card-active-tool-${order.id}`}
                            footer={
                              <div className="w-full">
                                <div className="flex items-center justify-center gap-2 mb-3">
                                  <StatusBadge status={order.status} />
                                  {order.expiresAt && (
                                    <span className="text-xs text-muted-foreground font-semibold">
                                      until{" "}
                                      {new Date(order.expiresAt).toLocaleDateString("en-NG", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </span>
                                  )}
                                </div>

                                {hasAutoLogin && (
                                  <div>
                                    <button
                                      type="button"
                                      disabled={limitReached}
                                      className={`flex items-center justify-center gap-2 w-full h-11 text-sm font-bold rounded-lg transition-colors ${
                                        limitReached
                                          ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                                          : "bg-primary hover:bg-primary/90 text-white cursor-pointer"
                                      }`}
                                      onClick={() => {
                                        if (limitReached) return;
                                        const url = `${BASE_PATH}/api/proxy/${order.productId}/`;
                                        toast({
                                          title: `Opening ${order.productName}…`,
                                          description: "Logging in from a single secure IP…",
                                        });
                                        const win = window.open(url, "_blank", "noopener,noreferrer");
                                        if (!win) {
                                          window.location.href = url;
                                        }
                                      }}
                                    >
                                      <ExternalLink className="w-4 h-4" />
                                      Launch
                                    </button>
                                    {limitReached ? (
                                      <p className="text-center text-xs text-red-500 mt-2 font-semibold">
                                        Daily limit reached. Resets at midnight WAT.
                                      </p>
                                    ) : dailyLimit != null ? (
                                      <p className="text-center text-xs text-muted-foreground mt-2">
                                        Tasks left today: {remaining} / {dailyLimit}
                                      </p>
                                    ) : null}
                                  </div>
                                )}

                                {hasCreds && (
                                  <CredentialBox
                                    username={order.credUsername}
                                    password={order.credPassword}
                                  />
                                )}

                                {!hasAutoLogin && !hasCreds && (
                                  <p className="text-xs text-muted-foreground italic">
                                    Login details will appear here once configured.
                                  </p>
                                )}
                              </div>
                            }
                          />
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {pendingOrders.length > 0 && (
                <AccordionItem
                  value="pending"
                  className="border border-gray-100 rounded-2xl px-5 bg-white"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <span className="flex items-center gap-2 text-lg font-bold uppercase tracking-wider text-foreground">
                      <Clock className="w-5 h-5 text-yellow-500" />
                      Pending
                      <span className="ml-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold">
                        {pendingOrders.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {pendingOrders.map((order) => (
                        <TransactionRow key={order.id} order={order} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}

              {failedOrders.length > 0 && (
                <AccordionItem
                  value="failed"
                  className="border border-gray-100 rounded-2xl px-5 bg-white"
                >
                  <AccordionTrigger className="hover:no-underline py-4">
                    <span className="flex items-center gap-2 text-lg font-bold uppercase tracking-wider text-foreground">
                      <XCircle className="w-5 h-5 text-red-500" />
                      Failed
                      <span className="ml-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">
                        {failedOrders.length}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {failedOrders.map((order) => (
                        <TransactionRow key={order.id} order={order} />
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>

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
