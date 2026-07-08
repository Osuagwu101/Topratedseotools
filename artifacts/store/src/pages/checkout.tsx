import { useState } from "react";
import { useLocation } from "wouter";
import { useGetProduct, useCreateOrder, useInitializePayment } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, ShieldCheck } from "lucide-react";

export default function Checkout() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const productId = parseInt(searchParams.get("productId") || "0", 10);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: product, isLoading: isProductLoading } = useGetProduct(productId, {
    query: { enabled: !!productId }
  });

  const createOrder = useCreateOrder();
  const initPayment = useInitializePayment();

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || !name || !email) return;

    setIsProcessing(true);
    try {
      // 1. Create order
      const order = await createOrder.mutateAsync({
        data: {
          productId,
          customerName: name,
          customerEmail: email,
        }
      });

      // 2. Initialize Paystack payment
      const payment = await initPayment.mutateAsync({
        data: {
          orderId: order.id,
          email: order.customerEmail,
          amountKobo: order.amountKobo
        }
      });

      // 3. Redirect to Paystack
      window.location.href = payment.authorizationUrl;
    } catch (error) {
      console.error("Checkout failed:", error);
      setIsProcessing(false);
      // In a real app we'd use toast here
    }
  };

  if (isProductLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 max-w-3xl flex justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!product) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">Invalid checkout session</h1>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-4xl">
        <h1 className="text-3xl font-bold tracking-tight mb-8">Secure Checkout</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
          <div className="md:col-span-3">
            <Card className="p-6 md:p-8 bg-card border-white/10">
              <form onSubmit={handleCheckout} className="space-y-6">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold border-b border-white/10 pb-2">Your Details</h2>
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name</Label>
                    <Input 
                      id="name" 
                      required 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="bg-background border-white/10 focus-visible:ring-primary h-12"
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      required 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. john@example.com"
                      className="bg-background border-white/10 focus-visible:ring-primary h-12"
                      data-testid="input-email"
                    />
                    <p className="text-xs text-muted-foreground">Access details will be sent here.</p>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={isProcessing || !name || !email}
                  className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 text-white rounded-xl"
                  data-testid="button-pay"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Processing...</>
                  ) : (
                    `Pay ₦${(product.priceKobo / 100).toLocaleString()}`
                  )}
                </Button>
                
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mt-4">
                  <ShieldCheck className="w-4 h-4 text-emerald-500" />
                  Secured by Paystack
                </div>
              </form>
            </Card>
          </div>
          
          <div className="md:col-span-2">
            <div className="p-6 rounded-2xl bg-card border border-white/10 sticky top-24">
              <h2 className="text-lg font-semibold mb-4 pb-2 border-b border-white/10">Order Summary</h2>
              
              <div className="flex justify-between items-start mb-6">
                <div>
                  <div className="font-medium">{product.name}</div>
                  <div className="text-sm text-muted-foreground capitalize">{product.billingPeriod.replace('_', ' ')} Plan</div>
                </div>
                <div className="font-semibold">
                  ₦{(product.priceKobo / 100).toLocaleString()}
                </div>
              </div>
              
              <div className="pt-4 border-t border-white/10 space-y-2 mb-6">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₦{(product.priceKobo / 100).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm text-emerald-400">
                  <span>Fees</span>
                  <span>Free</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <span className="font-semibold text-lg">Total</span>
                <span className="font-bold text-2xl text-primary">₦{(product.priceKobo / 100).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
