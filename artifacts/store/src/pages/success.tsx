import { useEffect } from "react";
import { Link } from "wouter";
import { useVerifyPayment } from "@workspace/api-client-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function Success() {
  const searchParams = new URLSearchParams(window.location.search);
  const reference = searchParams.get("reference") || "";

  const { data: verification, isLoading, error } = useVerifyPayment(reference, {
    query: { enabled: !!reference }
  });

  if (!reference) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
          <Card className="p-10 border-destructive border-2 bg-white shadow-xl rounded-2xl text-center">
            <XCircle className="w-20 h-20 text-destructive mx-auto mb-6" />
            <h1 className="text-3xl font-heading mb-4 uppercase">Invalid Reference</h1>
            <p className="text-lg text-muted-foreground mb-10 font-medium">We couldn't find a payment reference in the URL.</p>
            <Link href="/">
              <Button className="w-full h-14 text-lg font-bold rounded-xl uppercase tracking-wider">Return Home</Button>
            </Link>
          </Card>
        </div>
      </Layout>
    );
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-32 text-center flex flex-col items-center">
          <Loader2 className="w-16 h-16 animate-spin text-primary mb-8" />
          <h1 className="text-3xl font-heading mb-4 uppercase">Verifying Payment</h1>
          <p className="text-lg text-muted-foreground font-medium">Please wait while we confirm your transaction with Paystack.</p>
        </div>
      </Layout>
    );
  }

  const isSuccess = verification?.status === "success";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 max-w-lg text-center">
        <Card className={`p-10 border-t-8 ${isSuccess ? 'border-t-primary' : 'border-t-destructive'} border-x-border border-b-border bg-white shadow-xl rounded-2xl`}>
          {isSuccess ? (
            <CheckCircle2 className="w-24 h-24 text-primary mx-auto mb-8 drop-shadow-md" />
          ) : (
            <XCircle className="w-24 h-24 text-destructive mx-auto mb-8" />
          )}
          
          <h1 className="text-4xl font-heading mb-4 uppercase tracking-tight" data-testid="status-heading">
            {isSuccess ? "Success!" : "Failed"}
          </h1>
          
          <p className="text-lg text-muted-foreground mb-10 font-medium leading-relaxed" data-testid="status-message">
            {isSuccess 
              ? "Your subscription is now active. We've sent your access details to your email." 
              : "We couldn't process your payment. Please try again or contact support."}
          </p>

          <div className="bg-[#F7F8F9] rounded-xl p-6 mb-10 text-sm text-left border border-border font-semibold">
            <div className="flex justify-between mb-4 border-b border-border pb-3">
              <span className="text-muted-foreground uppercase tracking-widest text-xs">Reference</span>
              <span className="font-mono bg-white px-2 py-1 rounded border border-border text-xs">{reference}</span>
            </div>
            {verification && (
              <div className="flex justify-between items-center pt-1">
                <span className="text-muted-foreground uppercase tracking-widest text-xs">Amount Paid</span>
                <span className="font-heading text-xl text-primary">₦{(verification.amount / 100).toLocaleString()}</span>
              </div>
            )}
          </div>

          <Link href="/">
            <Button className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white rounded-xl uppercase tracking-wider shadow-md transition-all" data-testid="button-home">
              {isSuccess ? "Return to Catalog" : "Try Again"}
            </Button>
          </Link>
        </Card>
      </div>
    </Layout>
  );
}
