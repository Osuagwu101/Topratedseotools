import { useMemo, useState } from "react";
import { useUser } from "@clerk/react";
import { useGetProduct, getGetProductQueryKey, useCreateOrder, useInitializePayment } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type Duration = 1 | 3 | 12;

const DURATION_LABELS: Record<Duration, string> = {
  1: "1 Month",
  3: "3 Months",
  12: "12 Months",
};

export default function Checkout() {
  const searchParams = new URLSearchParams(window.location.search);
  const productId = parseInt(searchParams.get("productId") || "0", 10);

  const [isProcessing, setIsProcessing] = useState(false);
  const [duration, setDuration] = useState<Duration>(1);
  const { toast } = useToast();
  const { user } = useUser();

  const { data: product, isLoading: isProductLoading } = useGetProduct(productId, {
    query: { enabled: !!productId, queryKey: getGetProductQueryKey(productId) }
  });

  const createOrder = useCreateOrder();
  const initPayment = useInitializePayment();

  const availableDurations = useMemo(() => {
    if (!product) return [];
    const options: { duration: Duration; priceKobo: number }[] = [
      { duration: 1, priceKobo: product.priceKobo },
    ];
    if (product.price3MonthKobo != null) options.push({ duration: 3, priceKobo: product.price3MonthKobo });
    if (product.price12MonthKobo != null) options.push({ duration: 12, priceKobo: product.price12MonthKobo });
    return options;
  }, [product]);

  const selectedOption = availableDurations.find((o) => o.duration === duration) ?? availableDurations[0];

  const name = user?.fullName || user?.username || "SubsHub User";
  const email = user?.primaryEmailAddress?.emailAddress || "";

  const handleCheckout = async () => {
    if (!product || !email) return;

    setIsProcessing(true);
    try {
      const order = await createOrder.mutateAsync({
        data: {
          productId,
          customerName: name,
          customerEmail: email,
          durationMonths: selectedOption?.duration ?? 1,
        }
      });

      const payment = await initPayment.mutateAsync({
        data: {
          orderId: order.id,
          email: order.customerEmail,
          amountKobo: order.amountKobo
        }
      });

      window.location.href = payment.authorizationUrl;
    } catch (error) {
      console.error("Checkout failed:", error);
      toast({
        title: "Payment could not start",
        description:
          error instanceof Error && error.message
            ? error.message
            : "Something went wrong initializing your payment. Please try again.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  if (isProductLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 max-w-3xl flex justify-center">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-3xl font-heading uppercase">Invalid checkout session</h1>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-5xl">
        <h1 className="text-4xl md:text-5xl font-heading tracking-tight mb-10 text-center uppercase">Secure Checkout</h1>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-8 lg:gap-12">
          <div className="md:col-span-3">
            <Card className="p-6 md:p-10 bg-white border border-border shadow-lg rounded-2xl">
              <div className="space-y-8">
                <div className="space-y-6">
                  <h2 className="text-2xl font-heading border-b border-border pb-4 uppercase">Your Details</h2>
                  <div className="bg-[#F7F8F9] rounded-xl p-5 border border-border">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Name</span>
                      <span className="font-semibold" data-testid="text-checkout-name">{name}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Email</span>
                      <span className="font-semibold" data-testid="text-checkout-email">{email}</span>
                    </div>
                  </div>
                </div>

                {availableDurations.length > 1 && (
                  <div className="space-y-4">
                    <h2 className="text-2xl font-heading border-b border-border pb-4 uppercase">Choose Duration</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {availableDurations.map((option) => (
                        <button
                          key={option.duration}
                          type="button"
                          onClick={() => setDuration(option.duration)}
                          data-testid={`button-duration-${option.duration}`}
                          className={`rounded-xl border-2 p-4 text-left transition-all ${
                            duration === option.duration
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/40"
                          }`}
                        >
                          <div className="font-bold uppercase tracking-wider text-xs text-muted-foreground mb-1">
                            {DURATION_LABELS[option.duration]}
                          </div>
                          <div className="font-heading text-xl text-primary">
                            ₦{(option.priceKobo / 100).toLocaleString()}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Button
                  type="button"
                  onClick={handleCheckout}
                  disabled={isProcessing || !email}
                  className="w-full h-16 text-lg font-bold bg-primary hover:bg-primary/90 text-white rounded-xl uppercase tracking-wider shadow-md transition-all mt-4"
                  data-testid="button-pay"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Processing...</>
                  ) : (
                    `Pay ₦${((selectedOption?.priceKobo ?? product.priceKobo) / 100).toLocaleString()}`
                  )}
                </Button>

                <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mt-6">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Secured by Paystack
                </div>
              </div>
            </Card>
          </div>

          <div className="md:col-span-2">
            <div className="p-8 rounded-2xl bg-[#F7F8F9] border-2 border-primary/20 sticky top-24 shadow-sm">
              <h2 className="text-xl font-heading mb-6 pb-4 border-b border-border uppercase">Order Summary</h2>

              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="font-bold text-lg mb-1">{product.name}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    {DURATION_LABELS[duration]} Plan
                  </div>
                </div>
                <div className="font-heading text-xl text-primary">
                  ₦{((selectedOption?.priceKobo ?? product.priceKobo) / 100).toLocaleString()}
                </div>
              </div>

              <div className="pt-6 border-t border-border space-y-4 mb-8 font-semibold text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₦{((selectedOption?.priceKobo ?? product.priceKobo) / 100).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-primary">
                  <span>Fees</span>
                  <span>Free</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-6 border-t border-border">
                <span className="font-heading text-2xl uppercase">Total</span>
                <span className="font-heading text-3xl text-primary">
                  ₦{((selectedOption?.priceKobo ?? product.priceKobo) / 100).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
