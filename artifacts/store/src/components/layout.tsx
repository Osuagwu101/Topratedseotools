import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { User, LogOut, LayoutDashboard, ChevronDown, Search, X, Menu } from "lucide-react";
import { useCurrency, CURRENCIES } from "@/context/currency";
import { useSiteSettings } from "@/context/siteSettings";
import { PaymentIcons } from "./PaymentIcons";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function HeaderSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    setLocation(trimmed ? `/catalog?q=${encodeURIComponent(trimmed)}` : "/catalog");
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search"
        data-testid="button-open-search"
        className="text-foreground hover:text-primary transition-colors"
      >
        <Search className="w-5 h-5" />
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1.5">
      <div className="relative">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tools..."
          data-testid="input-search"
          className="h-9 w-40 sm:w-56 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>
      <button
        type="button"
        onClick={() => { setOpen(false); setQuery(""); }}
        aria-label="Close search"
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </form>
  );
}

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const copyrightYear = settings.useDynamicCopyrightYear
    ? String(new Date().getFullYear())
    : settings.copyrightYear;

  const logo = (
    <Link href="/" className="flex items-center justify-center gap-2 group" data-testid="link-home" onClick={() => setMobileMenuOpen(false)}>
      {settings.siteLogoUrl ? (
        <img
          src={settings.siteLogoUrl}
          alt="Top Rated SEO Tools Logo"
          className="h-9 md:h-10 w-auto max-w-[160px] md:max-w-[200px] object-contain"
        />
      ) : (
        <img
          src={`${basePath}/logo.png`}
          alt="Top Rated SEO Tools Logo"
          className="h-9 md:h-10 w-auto max-w-[160px] md:max-w-[200px] object-contain"
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = "none";
            const span = document.createElement("span");
            span.className = "font-heading text-xl md:text-2xl tracking-tight text-primary uppercase";
            span.textContent = "Top Rated SEO Tools";
            img.parentElement?.appendChild(span);
          }}
        />
      )}
    </Link>
  );

  return (
    <div className="min-h-screen bg-[#F7F8F9] flex flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
        <div className="container mx-auto px-4 md:px-6 h-16 md:h-20 grid grid-cols-[auto_1fr_auto] md:grid-cols-[1fr_auto_1fr] items-center gap-2 md:gap-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((o) => !o)}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            data-testid="button-mobile-menu"
            className="md:hidden text-foreground hover:text-primary transition-colors justify-self-start"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="hidden md:block" />
          {logo}
          <div className="flex items-center justify-end">
            <HeaderSearch />
          </div>
        </div>
        <div className="hidden md:block border-t border-border">
          <div className="container mx-auto px-4 md:px-6 h-14 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div />
            <nav className="flex items-center justify-center gap-6 text-sm font-bold uppercase tracking-wider text-foreground">
              <Link href="/" className="hover:text-primary transition-colors" data-testid="link-nav-home">
                Home
              </Link>
              <Link href="/catalog" className="hover:text-primary transition-colors" data-testid="link-nav-catalog">
                Catalog
              </Link>
              <Link href="/blog" className="hover:text-primary transition-colors" data-testid="link-nav-blog">
                Blog
              </Link>
              <Link href="/support" className="hover:text-primary transition-colors" data-testid="link-nav-support">
                Support
              </Link>
            </nav>
            <div className="flex items-center justify-end gap-4">
              <CurrencySwitcher />
              <NavAuth />
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-white shadow-sm" data-testid="menu-mobile">
            <nav className="flex flex-col px-4 py-3 text-sm font-bold uppercase tracking-wider text-foreground">
              <Link href="/" onClick={() => setMobileMenuOpen(false)} className="py-2.5 border-b border-gray-100 hover:text-primary transition-colors" data-testid="link-nav-home-mobile">
                Home
              </Link>
              <Link href="/catalog" onClick={() => setMobileMenuOpen(false)} className="py-2.5 border-b border-gray-100 hover:text-primary transition-colors" data-testid="link-nav-catalog-mobile">
                Catalog
              </Link>
              <Link href="/blog" onClick={() => setMobileMenuOpen(false)} className="py-2.5 border-b border-gray-100 hover:text-primary transition-colors" data-testid="link-nav-blog-mobile">
                Blog
              </Link>
              <Link href="/support" onClick={() => setMobileMenuOpen(false)} className="py-2.5 border-b border-gray-100 hover:text-primary transition-colors" data-testid="link-nav-support-mobile">
                Support
              </Link>
            </nav>
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100">
              <CurrencySwitcher />
              <div onClick={() => setMobileMenuOpen(false)}>
                <NavAuth />
              </div>
            </div>
          </div>
        )}
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border pt-14 pb-10 mt-24 bg-white">
        <div className="container mx-auto px-4 md:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 pb-10 border-b border-border">
            <div className="flex flex-col items-center lg:items-start text-center lg:text-left">
              {settings.siteLogoUrl ? (
                <img
                  src={settings.siteLogoUrl}
                  alt="Top Rated SEO Tools Logo"
                  className="h-8 w-auto max-w-[160px] object-contain mb-4"
                />
              ) : (
                <img
                  src={`${basePath}/logo.png`}
                  alt="Top Rated SEO Tools Logo"
                  className="h-8 w-auto max-w-[160px] object-contain mb-4"
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const span = document.createElement("span");
                    span.className = "font-heading text-lg text-primary uppercase tracking-wider mb-4 block";
                    span.textContent = settings.copyrightText;
                    img.parentElement?.appendChild(span);
                  }}
                />
              )}
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
                Affordable, verified access to the premium tools you already rely on.
              </p>
            </div>

            <div className="text-center lg:text-left">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-4">Quick Links</h3>
              <nav className="flex flex-col gap-2.5 text-sm text-muted-foreground">
                <Link href="/" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Home</Link>
                <Link href="/catalog" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Catalog</Link>
                <Link href="/blog" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Blog</Link>
                <Link href="/support" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Support</Link>
                <Link href="/dashboard" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Dashboard</Link>
              </nav>
            </div>

            <div className="text-center lg:text-left">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-4">Customer Care</h3>
              <nav className="flex flex-col gap-2.5 text-sm text-muted-foreground">
                <Link href="/support" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Get Support</Link>
                {settings.whatsappEnabled && settings.whatsappNumber && (
                  <a
                    href={`https://wa.me/${settings.whatsappNumber.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-primary transition-colors"
                  >
                    WhatsApp Us
                  </a>
                )}
                {settings.businessEmailPublic && settings.businessEmail && (
                  <a
                    href={settings.businessEmailClickable ? `mailto:${settings.businessEmail}` : undefined}
                    className="hover:text-primary transition-colors"
                  >
                    {settings.businessEmail}
                  </a>
                )}
              </nav>
            </div>

            <div className="text-center lg:text-left">
              <h3 className="text-xs font-bold uppercase tracking-widest text-foreground mb-4">Legal</h3>
              <nav className="flex flex-col gap-2.5 text-sm text-muted-foreground">
                <Link href="/support" className="hover:text-primary transition-colors" onClick={() => setMobileMenuOpen(false)}>Terms & Support</Link>
              </nav>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left pt-8">
            <span className="font-semibold text-muted-foreground text-sm">
              &copy; {copyrightYear} {settings.copyrightText}. All rights reserved.
            </span>
            <div className="flex flex-col items-center md:items-end gap-4">
              <PaymentIcons />
              <p className="text-xs text-muted-foreground max-w-xs md:max-w-sm text-center md:text-right leading-relaxed">
                {settings.paymentFooterText}
              </p>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
