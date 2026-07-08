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
      const order = await createOrder.mutateAsync({
        data: {
          productId,
          customerName: name,
          customerEmail: email,
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
              <form onSubmit={handleCheckout} className="space-y-8">
                <div className="space-y-6">
                  <h2 className="text-2xl font-heading border-b border-border pb-4 uppercase">Your Details</h2>
                  <div className="space-y-3">
                    <Label htmlFor="name" className="font-bold uppercase tracking-wider text-xs">Full Name</Label>
                    <Input 
                      id="name" 
                      required 
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="e.g. John Doe"
                      className="bg-[#F7F8F9] border-border focus-visible:ring-primary h-14 rounded-xl font-medium"
                      data-testid="input-name"
                    />
                  </div>
                  <div className="space-y-3">
                    <Label htmlFor="email" className="font-bold uppercase tracking-wider text-xs">Email Address</Label>
                    <Input 
                      id="email" 
                      type="email" 
                      required 
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="e.g. john@example.com"
                      className="bg-[#F7F8F9] border-border focus-visible:ring-primary h-14 rounded-xl font-medium"
                      data-testid="input-email"
                    />
                    <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mt-2">Access details will be sent here.</p>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={isProcessing || !name || !email}
                  className="w-full h-16 text-lg font-bold bg-primary hover:bg-primary/90 text-white rounded-xl uppercase tracking-wider shadow-md transition-all mt-4"
                  data-testid="button-pay"
                >
                  {isProcessing ? (
                    <><Loader2 className="w-5 h-5 mr-3 animate-spin" /> Processing...</>
                  ) : (
                    `Pay ₦${(product.priceKobo / 100).toLocaleString()}`
                  )}
                </Button>
                
                <div className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground mt-6">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Secured by Paystack
                </div>
              </form>
            </Card>
          </div>
          
          <div className="md:col-span-2">
            <div className="p-8 rounded-2xl bg-[#F7F8F9] border-2 border-primary/20 sticky top-24 shadow-sm">
              <h2 className="text-xl font-heading mb-6 pb-4 border-b border-border uppercase">Order Summary</h2>
              
              <div className="flex justify-between items-start mb-8">
                <div>
                  <div className="font-bold text-lg mb-1">{product.name}</div>
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{product.billingPeriod.replace('_', ' ')} Plan</div>
                </div>
                <div className="font-heading text-xl text-primary">
                  ₦{(product.priceKobo / 100).toLocaleString()}
                </div>
              </div>
              
              <div className="pt-6 border-t border-border space-y-4 mb-8 font-semibold text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>₦{(product.priceKobo / 100).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-primary">
                  <span>Fees</span>
                  <span>Free</span>
                </div>
              </div>
              
              <div className="flex justify-between items-center pt-6 border-t border-border">
                <span className="font-heading text-2xl uppercase">Total</span>
                <span className="font-heading text-3xl text-primary">₦{(product.priceKobo / 100).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
