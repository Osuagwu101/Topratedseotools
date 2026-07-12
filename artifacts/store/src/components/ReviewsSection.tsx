import { useEffect, useState } from "react";
import { Star, ShieldCheck, MessageSquareReply } from "lucide-react";

interface Review {
  id: number;
  clerkUserId: string;
  rating: number;
  title: string | null;
  text: string;
  verified: boolean;
  adminReply: string | null;
  adminReplyAt: string | null;
  createdAt: string;
}

interface Summary {
  average: number;
  total: number;
  breakdown: { rating: number; count: number }[];
}

export function ReviewsSection({ productId }: { productId: number }) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    Promise.all([
      fetch(`${basePath}/api/reviews?productId=${productId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`${basePath}/api/reviews/summary?productId=${productId}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([r, s]) => {
        setReviews(Array.isArray(r) ? r : []);
        setSummary(s && typeof s.average === "number" ? s : null);
      })
      .catch(() => {
        setReviews([]);
        setSummary(null);
      });
  }, [productId, basePath]);

  if (reviews.length === 0 && (!summary || summary.total === 0)) return null;

  return (
    <div className="mt-14">
      <h3 className="font-heading text-2xl uppercase border-b border-border pb-4 mb-8">Customer Reviews</h3>

      {summary && summary.total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-6 mb-8 bg-[#F7F8F9] rounded-2xl p-6 border border-border">
          <div className="text-center sm:text-left">
            <div className="text-4xl font-heading font-bold text-foreground">{summary.average.toFixed(1)}</div>
            <div className="flex items-center justify-center sm:justify-start gap-1 mt-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-4 h-4 ${i < Math.round(summary.average) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`}
                />
              ))}
            </div>
            <div className="text-xs text-muted-foreground font-semibold mt-1">Based on {summary.total} review{summary.total !== 1 ? "s" : ""}</div>
          </div>
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map((rating) => {
              const row = summary.breakdown.find((b) => b.rating === rating);
              const count = row?.count ?? 0;
              const pct = summary.total > 0 ? (count / summary.total) * 100 : 0;
              return (
                <div key={rating} className="flex items-center gap-3 text-sm">
                  <span className="w-3 font-semibold text-muted-foreground">{rating}</span>
                  <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-8 text-right text-xs text-muted-foreground font-semibold">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="space-y-6">
        {reviews.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < r.rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`}
                    />
                  ))}
                </div>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                    <ShieldCheck className="w-3 h-3" />
                    Verified Purchase
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground font-semibold">{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
            {r.title && <h4 className="font-bold text-foreground mb-2">{r.title}</h4>}
            <p className="text-muted-foreground font-medium leading-relaxed">{r.text}</p>
            {r.adminReply && (
              <div className="mt-4 bg-[#F7F8F9] rounded-xl p-4 border border-border">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary mb-2">
                  <MessageSquareReply className="w-4 h-4" />
                  Response from Top Rated SEO Tools
                </div>
                <p className="text-sm text-foreground font-medium">{r.adminReply}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
