import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useVerifyPayment, getVerifyPaymentQueryKey, getGetMyOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const COUNTDOWN_SECONDS = 20;
const BASE_PATH = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Success() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const searchParams = new URLSearchParams(window.location.search);
  const reference = searchParams.get("reference") || "";

  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [redirectStarted, setRedirectStarted] = useState(false);

  const { data: verification, isLoading, error } = useVerifyPayment(reference, {
    query: { enabled: !!reference, queryKey: getVerifyPaymentQueryKey(reference) }
  });

  const isSuccess = verification?.status === "success";

  const goToDashboard = useCallback(() => {
    setLocation("/dashboard");
  }, [setLocation]);

  useEffect(() => {
    if (!isSuccess) return;
    queryClient.invalidateQueries({ queryKey: getGetMyOrdersQueryKey() });
  }, [isSuccess, queryClient]);

  useEffect(() => {
    if (!isSuccess || redirectStarted) return;
    setRedirectStarted(true);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          goToDashboard();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSuccess, redirectStarted, goToDashboard]);

  if (!reference) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center max-w-lg">
          <Card className="p-10 border-destructive border-2 bg-white shadow-xl rounded-2xl text-center">
            <XCircle className="w-20 h-20 text-destructive mx-auto mb-6" />
            <h1 className="text-3xl font-heading mb-4 uppercase">Invalid Reference</h1>
            <p className="text-lg text-muted-foreground mb-10 font-medium">We couldn't find a payment reference in the URL.</p>
            <Button
              className="w-full h-14 text-lg font-bold rounded-xl uppercase tracking-wider"
              onClick={() => setLocation("/")}
            >
              Return Home
            </Button>
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

  if (error || !verification || !isSuccess) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 max-w-lg text-center">
          <Card className="p-10 border-t-8 border-t-destructive border-x-border border-b-border bg-white shadow-xl rounded-2xl">
            <XCircle className="w-24 h-24 text-destructive mx-auto mb-8" />
            <h1 className="text-4xl font-heading mb-4 uppercase tracking-tight" data-testid="status-heading">
              Payment Verification Failed
            </h1>
            <p className="text-lg text-muted-foreground mb-10 font-medium leading-relaxed" data-testid="status-message">
              We could not confirm your payment. Please try again or contact support if you have already been charged.
            </p>
            {verification && (
              <div className="bg-[#F7F8F9] rounded-xl p-6 mb-8 text-sm text-left border border-border font-semibold">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground uppercase tracking-widest text-xs">Reference</span>
                  <span className="font-mono bg-white px-2 py-1 rounded border border-border text-xs">{reference}</span>
                </div>
              </div>
            )}
            <Button
              className="w-full h-14 text-lg font-bold rounded-xl uppercase tracking-wider"
              onClick={() => setLocation(`${BASE_PATH}/catalog`)}
              data-testid="button-home"
            >
              Try Again
            </Button>
          </Card>
        </div>
      </Layout>
    );
  }

  const toolName = verification.productName ?? "your tool";

  return (
    <Layout>
      <div className="container mx-auto px-4 py-16 max-w-lg text-center">
        <Card className="p-10 border-t-8 border-t-primary border-x-border border-b-border bg-white shadow-xl rounded-2xl" data-testid="success-card">
          <div className="flex justify-center mb-8">
            <div className="relative">
              <CheckCircle2 className="w-24 h-24 text-primary drop-shadow-md" />
            </div>
          </div>

          <h1 className="text-4xl font-heading mb-3 uppercase tracking-tight text-foreground" data-testid="status-heading">
            Purchase Successful!
          </h1>

          <p className="text-lg text-muted-foreground mb-8 font-medium leading-relaxed" data-testid="status-message">
            You have successfully purchased{" "}
            <span className="font-bold text-primary">{verification.productName ?? "your tool"}</span>{" "}
            from Top Rated SEO Tools.
          </p>

          <div className="bg-[#F7F8F9] rounded-xl p-6 mb-8 text-sm text-left border border-border font-semibold">
            <div className="flex justify-between mb-4 border-b border-border pb-3">
              <span className="text-muted-foreground uppercase tracking-widest text-xs">Reference</span>
              <span className="font-mono bg-white px-2 py-1 rounded border border-border text-xs">{reference}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground uppercase tracking-widest text-xs">Amount Paid</span>
              <span className="font-heading text-xl text-primary">₦{(verification.amount / 100).toLocaleString()}</span>
            </div>
          </div>

          <div className="mb-8">
            <p className="text-sm text-muted-foreground font-medium">
              You will be redirected to your dashboard in{" "}
              <span className="font-bold text-primary text-base">{countdown}</span>{" "}
              second{countdown !== 1 ? "s" : ""}.
            </p>
            <div className="w-full bg-gray-100 rounded-full h-1.5 mt-3">
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-1000"
                style={{ width: `${(countdown / COUNTDOWN_SECONDS) * 100}%` }}
              />
            </div>
          </div>

          <Button
            className="w-full h-14 text-lg font-bold bg-primary hover:bg-primary/90 text-white rounded-xl uppercase tracking-wider shadow-md transition-all"
            onClick={goToDashboard}
            data-testid="button-home"
          >
            Go to Dashboard Now
          </Button>
        </Card>
      </div>
    </Layout>
  );
}
