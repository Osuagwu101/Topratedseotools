import { useState } from "react";
import { Button } from "@/components/ui/button";
import { pushDataLayer } from "@/lib/analytics";

export default function NewsletterSignup() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setStatus("loading");
    try {
      const res = await fetch("/api/blog/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "blog" })
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setStatus("success");
        setMessage(data.message || "Thanks for subscribing!");
        pushDataLayer({ event: "newsletter_signup" });
        setEmail("");
      } else {
        setStatus("error");
        setMessage("Failed to subscribe. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("An error occurred. Please try again.");
    }
  };

  return (
    <div className="bg-white border border-border p-6 sm:p-8 rounded-3xl shadow-sm">
      <h3 className="text-xl font-heading font-bold text-foreground mb-2">Get SEO Insights Weekly</h3>
      <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
        Join 10,000+ marketers getting our best tool reviews, strategies, and industry news. No spam, ever.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="name@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full h-11 px-4 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          disabled={status === "loading" || status === "success"}
        />
        <Button 
          type="submit" 
          disabled={status === "loading" || status === "success"}
          className="w-full h-11 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl"
        >
          {status === "loading" ? "Subscribing..." : status === "success" ? "Subscribed!" : "Subscribe"}
        </Button>
      </form>
      {message && (
        <p className={`mt-3 text-sm font-medium ${status === "success" ? "text-primary" : "text-destructive"}`}>
          {message}
        </p>
      )}
    </div>
  );
}