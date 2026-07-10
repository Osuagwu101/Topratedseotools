import { Link } from "wouter";
import { Show, useUser, useClerk } from "@clerk/react";
import { Button } from "@/components/ui/button";
import { User, LogOut, LayoutDashboard } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
  return (
    <div className="min-h-screen bg-[#F7F8F9] flex flex-col font-sans text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
        <div className="container mx-auto px-4 md:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group" data-testid="link-home">
            <span className="font-heading text-2xl tracking-tight text-primary uppercase">Top Rated SEO Tools</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-bold uppercase tracking-wider text-foreground">
            <Link href="/" className="hidden sm:block hover:text-primary transition-colors" data-testid="link-nav-home">
              Home
            </Link>
            <Link href="/" className="hidden sm:block hover:text-primary transition-colors" data-testid="link-nav-catalog">
              Catalog
            </Link>
            <a href="#" className="hidden sm:block hover:text-primary transition-colors" data-testid="link-nav-support">
              Support
            </a>
            <NavAuth />
          </nav>
        </div>
      </header>
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-12 mt-24 bg-white">
        <div className="container mx-auto px-4 md:px-6 flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center gap-2">
            <span className="font-heading text-lg text-primary uppercase tracking-wider">Top Rated SEO Tools</span>
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
