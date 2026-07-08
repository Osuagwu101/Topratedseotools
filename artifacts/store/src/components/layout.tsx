import { Link } from "wouter";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F7F8F9] flex flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <span className="font-heading text-2xl tracking-tight text-primary uppercase">SubsHub</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-bold uppercase tracking-wider text-foreground">
            <Link href="/" className="hover:text-primary transition-colors" data-testid="link-nav-home">Home</Link>
            <Link href="/" className="hover:text-primary transition-colors" data-testid="link-nav-catalog">Catalog</Link>
            <a href="#" className="hover:text-primary transition-colors" data-testid="link-nav-support">Support</a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-12 mt-24 bg-white">
        <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center gap-2">
            <span className="font-heading text-lg text-primary uppercase tracking-wider">SubsHub</span>
            <span className="font-semibold text-muted-foreground ml-2 text-sm">&copy; 2025</span>
          </div>
          <div className="text-sm text-muted-foreground flex gap-4 font-bold uppercase tracking-wider">
            <span>Powered by Paystack</span>
            <span>Made in Nigeria</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
