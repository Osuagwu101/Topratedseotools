import { useEffect, useState } from "react";
import { Users } from "lucide-react";

export function CustomerCounter() {
  const [total, setTotal] = useState<number | null>(null);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${basePath}/api/customers-served`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.total === "number") setTotal(data.total);
      })
      .catch(() => setTotal(null));
  }, [basePath]);

  if (total === null) return null;

  return (
    <div className="flex items-center justify-center gap-3 py-4">
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
        <Users className="w-5 h-5 text-primary" />
      </div>
      <div className="text-center">
        <div className="text-2xl font-heading font-bold text-foreground leading-none">{total.toLocaleString()}</div>
        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mt-1">Customers Served</div>
      </div>
    </div>
  );
}
