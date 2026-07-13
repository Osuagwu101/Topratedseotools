import { useEffect, useState } from "react";
import BlogAdminPanel from "@/components/admin/BlogAdminPanel";
import { Loader2 } from "lucide-react";

// Standalone Blog CMS entry point for staff (editor/author) accounts —
// deliberately does NOT sit behind the main /admin dashboard's legacy
// ADMIN_USERNAME/ADMIN_PASSWORD gate. Staff sign in at
// /admin/blog-staff-login, land here, and BlogAdminPanel itself handles
// redirecting back to that login page if there's no valid staff session.
export default function BlogCms() {
  const [products, setProducts] = useState<{ id: number; name: string; description: string | null }[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/blog/products", { credentials: "include" });
        if (res.ok) {
          setProducts(await res.json());
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingProducts(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-[100dvh] bg-[#F7F8F9]">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-lg font-heading font-bold text-foreground">Blog CMS</h1>
      </header>
      <main className="p-4 sm:p-6 max-w-7xl mx-auto">
        {loadingProducts ? (
          <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <BlogAdminPanel products={products} />
        )}
      </main>
    </div>
  );
}
