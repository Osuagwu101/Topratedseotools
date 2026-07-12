import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Lock } from "lucide-react";
import { useSiteSettings } from "@/context/siteSettings";

export default function BlogStaffLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { settings } = useSiteSettings();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/blog/staff/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      
      if (!res.ok) {
        throw new Error(await res.text() || "Invalid credentials");
      }
      
      toast({ title: "Welcome back", description: "Successfully signed into the Blog CMS." });
      setLocation("/admin");
    } catch (err: any) {
      toast({ title: "Sign in failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#F7F8F9]">
      <div className="p-6">
        <Link href="/admin" className="inline-flex items-center text-sm font-semibold text-muted-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Admin
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-8 sm:p-10">
            <div className="mb-8 text-center">
              {settings.siteLogoUrl ? (
                <img
                  src={settings.siteLogoUrl}
                  alt="Logo"
                  className="h-10 w-auto mx-auto mb-6 object-contain"
                />
              ) : (
                <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center mx-auto mb-6">
                  <Lock className="w-6 h-6 text-primary" />
                </div>
              )}
              <h1 className="text-2xl font-heading font-bold text-foreground">Staff Portal</h1>
              <p className="text-muted-foreground mt-2 text-sm">Sign in to manage the blog</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Email Address
                </label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="author@example.com"
                  className="h-11"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Password
                </label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="h-11"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-bold bg-primary hover:bg-primary/90 text-white mt-2"
                disabled={loading}
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Sign In"}
              </Button>
            </form>
          </div>
          <div className="bg-gray-50 px-8 py-5 border-t border-gray-100 text-center">
            <p className="text-xs text-muted-foreground">
              This area is restricted to authorized editors and administrators.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
