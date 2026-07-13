import { useEffect, useState } from "react";
import { Link2Off, Link2, Loader2, RefreshCw } from "lucide-react";
import { StaffUser } from "../../BlogAdminPanel";

interface BrokenLinkInsight {
  id: number;
  postId: number;
  postTitle: string | null;
  postSlug: string | null;
  details: { href: string; anchorText: string };
  createdAt: string;
}

interface LinkOpportunityInsight {
  id: number;
  postId: number;
  postTitle: string | null;
  postSlug: string | null;
  details: {
    targetType: "product" | "post";
    targetId?: number;
    targetSlug?: string;
    targetLabel: string;
    reason: string;
    currentLinkCount: number;
  };
  createdAt: string;
}

/**
 * Periodic internal-linking insight feed for the AI Generator: flags
 * internal links that now point nowhere, and posts under the 5-link cap
 * that have a genuinely relevant product/post they could link to. The scan
 * itself runs server-side (throttled, just-in-time) — this panel only
 * displays the latest snapshot and lets administrators force a rescan.
 */
export default function LinkInsightsPanel({ staff, onOpenPost }: { staff: StaffUser; onOpenPost: (postId: number) => void }) {
  const [loading, setLoading] = useState(true);
  const [rescanning, setRescanning] = useState(false);
  const [brokenLinks, setBrokenLinks] = useState<BrokenLinkInsight[]>([]);
  const [linkOpportunities, setLinkOpportunities] = useState<LinkOpportunityInsight[]>([]);
  const [lastScanAt, setLastScanAt] = useState<string | null>(null);

  const fetchInsights = async (refresh = false) => {
    try {
      const res = await fetch(`/api/admin/blog/seo-generator/link-insights${refresh ? "?refresh=true" : ""}`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setBrokenLinks(data.brokenLinks ?? []);
      setLinkOpportunities(data.linkOpportunities ?? []);
      setLastScanAt(data.lastScanAt ?? null);
    } catch {
      // Silently ignore — non-critical background insight, matches the
      // MonthlyUsageBanner's failure handling.
    }
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchInsights();
      setLoading(false);
    })();
  }, []);

  const handleRescan = async () => {
    setRescanning(true);
    await fetchInsights(true);
    setRescanning(false);
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-500">Internal Link Insights</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {lastScanAt ? `Last scanned ${new Date(lastScanAt).toLocaleString()}` : "Not scanned yet — will run automatically on first load."} Every post is capped
            at 5 internal links; posts already at that cap are never flagged for more.
          </p>
        </div>
        {staff.role === "administrator" && (
          <button
            onClick={handleRescan}
            disabled={rescanning}
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            {rescanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Rescan now
          </button>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-red-600 mb-2 flex items-center gap-1.5">
          <Link2Off className="w-3.5 h-3.5" /> Broken internal links ({brokenLinks.length})
        </h4>
        {brokenLinks.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-gray-50 border border-gray-100 rounded-lg p-4">No broken internal links found.</div>
        ) : (
          <div className="border border-red-100 rounded-lg overflow-hidden divide-y divide-red-100">
            {brokenLinks.map((item) => (
              <div key={item.id} className="p-3 flex items-center justify-between gap-3 bg-red-50/50">
                <div className="text-sm">
                  <span className="font-bold text-foreground">{item.postTitle ?? `Post #${item.postId}`}</span>
                  <span className="text-muted-foreground"> links to </span>
                  <code className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{item.details.href}</code>
                  <span className="text-muted-foreground"> ("{item.details.anchorText}") which no longer exists.</span>
                </div>
                <button onClick={() => onOpenPost(item.postId)} className="shrink-0 text-xs font-bold text-primary hover:underline whitespace-nowrap">
                  Fix in editor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Link opportunities ({linkOpportunities.length})
        </h4>
        {linkOpportunities.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-gray-50 border border-gray-100 rounded-lg p-4">
            No suggestions right now — either every post already has a relevant link, or none is at the 5-link cap.
          </div>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-hidden divide-y divide-gray-100">
            {linkOpportunities.map((item) => (
              <div key={item.id} className="p-3 flex items-center justify-between gap-3">
                <div className="text-sm">
                  <span className="font-bold text-foreground">{item.postTitle ?? `Post #${item.postId}`}</span>
                  <span className="text-muted-foreground"> ({item.details.currentLinkCount}/5 links) could link to </span>
                  <span className="font-semibold text-foreground">{item.details.targetLabel}</span>
                  <span className="text-muted-foreground"> — {item.details.reason}</span>
                </div>
                <button onClick={() => onOpenPost(item.postId)} className="shrink-0 text-xs font-bold text-primary hover:underline whitespace-nowrap">
                  Add in editor
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
