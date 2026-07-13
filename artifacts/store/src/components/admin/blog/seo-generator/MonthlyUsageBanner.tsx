import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface MonthlyUsageStatus {
  monthCount: number;
  monthlyGenerationLimit: number;
  warningThresholdPercent: number;
  percentUsed: number;
  isAtOrOverThreshold: boolean;
  isAtOrOverLimit: boolean;
}

/**
 * Persistent, site-wide warning shown to administrators once monthly AI
 * generation usage crosses the configured threshold — so they find out
 * before staff are blocked mid-task, not only when they happen to open the
 * AI Generator settings tab. Polled on an interval so it stays fresh during
 * a long admin session.
 */
export default function MonthlyUsageBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [status, setStatus] = useState<MonthlyUsageStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/admin/blog/seo-generator/usage-alert", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        // Silently ignore — this is a non-critical background check.
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!status || !status.isAtOrOverThreshold) return null;

  const atCap = status.isAtOrOverLimit;

  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border mb-4 ${atCap ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
      <div className="flex items-center gap-3">
        <AlertTriangle className={`w-5 h-5 shrink-0 ${atCap ? "text-red-600" : "text-amber-600"}`} />
        <div>
          <p className={`text-sm font-bold ${atCap ? "text-red-800" : "text-amber-800"}`}>
            {atCap ? "Monthly AI generation cap reached" : "Approaching monthly AI generation cap"}
          </p>
          <p className={`text-xs ${atCap ? "text-red-700" : "text-amber-700"}`}>
            {status.monthCount} / {status.monthlyGenerationLimit} generations used this month ({status.percentUsed}%).{" "}
            {atCap ? "Staff can no longer generate content until the limit is raised." : `This has crossed your ${status.warningThresholdPercent}% warning threshold.`}
          </p>
        </div>
      </div>
      <button
        onClick={onOpenSettings}
        className={`shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg whitespace-nowrap ${atCap ? "bg-red-600 text-white hover:bg-red-700" : "bg-amber-600 text-white hover:bg-amber-700"}`}
      >
        Review in AI Generator
      </button>
    </div>
  );
}
