import { Link } from "wouter";
import { SiReact } from "react-icons/si";

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans dark text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:shadow-primary/40 transition-shadow">
              <span className="font-bold text-lg font-mono">S</span>
            </div>
            <span className="font-bold text-xl tracking-tight">SubsHub</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors" data-testid="link-nav-catalog">Catalog</Link>
            <a href="#" className="hover:text-foreground transition-colors" data-testid="link-nav-faq">FAQ</a>
            <a href="#" className="hover:text-foreground transition-colors" data-testid="link-nav-support">Support</a>
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-white/10 py-12 md:py-16 mt-24 bg-card/50">
        <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-white opacity-80">
              <span className="font-bold text-xs font-mono">S</span>
            </div>
            <span className="font-semibold text-muted-foreground">SubsHub &copy; 2025</span>
          </div>
          <div className="text-sm text-muted-foreground flex gap-4">
            <span>Powered by Paystack</span>
            <span>Made in Nigeria</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
