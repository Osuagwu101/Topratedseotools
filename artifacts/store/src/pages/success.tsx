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
        <div className="container mx-auto px-4 py-24 text-center max-w-md">
          <Card className="p-8 border-destructive/20 bg-destructive/5 text-center">
            <XCircle className="w-16 h-16 text-destructive mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">Invalid Reference</h1>
            <p className="text-muted-foreground mb-8">We couldn't find a payment reference in the URL.</p>
            <Link href="/">
              <Button className="w-full">Return Home</Button>
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
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-6" />
          <h1 className="text-2xl font-bold mb-2">Verifying Payment...</h1>
          <p className="text-muted-foreground">Please wait while we confirm your transaction with Paystack.</p>
        </div>
      </Layout>
    );
  }

  const isSuccess = verification?.status === "success";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-24 max-w-md text-center">
        <Card className={`p-8 border-t-4 ${isSuccess ? 'border-t-emerald-500' : 'border-t-destructive'} border-white/10 bg-card shadow-2xl`}>
          {isSuccess ? (
            <CheckCircle2 className="w-20 h-20 text-emerald-500 mx-auto mb-6 drop-shadow-[0_0_15px_rgba(16,185,129,0.4)]" />
          ) : (
            <XCircle className="w-20 h-20 text-destructive mx-auto mb-6" />
          )}
          
          <h1 className="text-3xl font-bold mb-2 tracking-tight" data-testid="status-heading">
            {isSuccess ? "Payment Successful!" : "Payment Failed"}
          </h1>
          
          <p className="text-muted-foreground mb-8" data-testid="status-message">
            {isSuccess 
              ? "Your subscription is now active. We've sent your access details to your email." 
              : "We couldn't process your payment. Please try again or contact support."}
          </p>

          <div className="bg-background rounded-lg p-4 mb-8 text-sm text-left border border-white/5">
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Reference</span>
              <span className="font-mono">{reference}</span>
            </div>
            {verification && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid</span>
                <span className="font-medium">₦{(verification.amount / 100).toLocaleString()}</span>
              </div>
            )}
          </div>

          <Link href="/">
            <Button className="w-full h-12 text-base bg-primary hover:bg-primary/90 text-white" data-testid="button-home">
              {isSuccess ? "Return to Dashboard" : "Try Again"}
            </Button>
          </Link>
        </Card>
      </div>
    </Layout>
  );
}
