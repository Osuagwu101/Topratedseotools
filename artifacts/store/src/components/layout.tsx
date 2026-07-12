import { useState, useRef, useEffect } from "react";
import { Link } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { User, LogOut, LayoutDashboard, ChevronDown } from "lucide-react";
import { useCurrency, CURRENCIES } from "@/context/currency";
import { useSiteSettings } from "@/context/siteSettings";
import { PaymentIcons } from "./PaymentIcons";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function CurrencySwitcher() {
  const { currency, setCurrency, loading } = useCurrency();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading}
        className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-foreground hover:text-primary transition-colors border border-gray-200 rounded-md px-2.5 py-1.5 bg-white hover:border-primary/40"
      >
        <span>{currency.label}</span>
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-36 bg-white border border-gray-100 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
          {CURRENCIES.map((c) => (
            <button
              key={c.code}
              onClick={() => { setCurrency(c.code); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm font-semibold transition-colors ${
                c.code === currency.code
                  ? "bg-primary/10 text-primary"
                  : "text-foreground hover:bg-gray-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NavAuth() {
  const { user } = useUser();
  const { signOut } = useClerk();

  return (
    <>
      <Show when="signed-in">
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <button className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-wider text-foreground hover:text-primary transition-colors">
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
            </button>
          </Link>
          <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              {user?.imageUrl ? (
                <img src={user.imageUrl} alt="avatar" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <User className="w-4 h-4 text-primary" />
              )}
            </div>
            <button
              onClick={() => signOut({ redirectUrl: basePath || "/" })}
              className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-600 transition-colors uppercase tracking-wider"
            >
              <LogOut className="w-3.5 h-3.5" />
              Out
            </button>
          </div>
        </div>
      </Show>
      <Show when="signed-out">
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm" className="font-bold uppercase tracking-wider text-foreground hover:text-primary text-xs h-9 px-4">
              Login
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm" className="bg-primary hover:bg-primary/90 text-white font-bold uppercase tracking-wider text-xs h-9 px-4 rounded-lg shadow-sm">
              Sign Up
            </Button>
          </Link>
        </div>
      </Show>
    </>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { settings } = useSiteSettings();

  const copyrightYear = settings.useDynamicCopyrightYear
    ? String(new Date().getFullYear())
    : settings.copyrightYear;

  return (
    <div className="min-h-screen bg-[#F7F8F9] flex flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            {settings.siteLogoUrl ? (
              <img
                src={settings.siteLogoUrl}
                alt="Top Rated SEO Tools Logo"
                className="h-9 w-auto max-w-[180px] object-contain"
              />
            ) : (
              <img
                src={`${basePath}/logo.png`}
                alt="Top Rated SEO Tools Logo"
                className="h-9 w-auto max-w-[180px] object-contain"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const span = document.createElement("span");
                  span.className = "font-heading text-2xl tracking-tight text-primary uppercase";
                  span.textContent = "Top Rated SEO Tools";
                  img.parentElement?.appendChild(span);
                }}
              />
            )}
          </Link>
          <nav className="flex items-center gap-4 text-sm font-bold uppercase tracking-wider text-foreground">
            <Link href="/" className="hidden sm:block hover:text-primary transition-colors" data-testid="link-nav-home">
              Home
            </Link>
            <Link href="/" className="hidden sm:block hover:text-primary transition-colors" data-testid="link-nav-catalog">
              Catalog
            </Link>
            <Link href="/support" className="hidden sm:block hover:text-primary transition-colors" data-testid="link-nav-support">
              Support
            </Link>
            <CurrencySwitcher />
            <NavAuth />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-12 mt-24 bg-white">
        <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center gap-2 flex-wrap justify-center md:justify-start">
            {settings.siteLogoUrl ? (
              <img
                src={settings.siteLogoUrl}
                alt="Top Rated SEO Tools Logo"
                className="h-7 w-auto max-w-[140px] object-contain"
              />
            ) : (
              <img
                src={`${basePath}/logo.png`}
                alt="Top Rated SEO Tools Logo"
                className="h-7 w-auto max-w-[140px] object-contain"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const span = document.createElement("span");
                  span.className = "font-heading text-lg text-primary uppercase tracking-wider";
                  span.textContent = settings.copyrightText;
                  img.parentElement?.appendChild(span);
                }}
              />
            )}
            <span className="font-semibold text-muted-foreground ml-2 text-sm">&copy; {copyrightYear}</span>
          </div>
          <div className="flex flex-col items-center md:items-end gap-4">
            <PaymentIcons />
            <p className="text-xs text-muted-foreground max-w-xs md:max-w-sm text-center md:text-right leading-relaxed">
              {settings.paymentFooterText}
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
