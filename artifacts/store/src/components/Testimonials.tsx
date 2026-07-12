import { useEffect, useState } from "react";
import { Star, Quote } from "lucide-react";
import { useSiteSettings } from "@/context/siteSettings";

interface Testimonial {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  jobTitle: string | null;
  text: string;
  rating: number | null;
  sortOrder: number;
}

export function Testimonials({ page = "home" }: { page?: string }) {
  const [items, setItems] = useState<Testimonial[]>([]);
  const { settings } = useSiteSettings();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    fetch(`${basePath}/api/testimonials?page=${encodeURIComponent(page)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => setItems([]));
  }, [basePath, page]);

  if (!settings.testimonialsEnabled) return null;
  if (items.length === 0) return null;

  return (
    <section className="py-20 bg-white border-t border-border">
      <div className="container mx-auto px-4 md:px-6 max-w-6xl">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-heading tracking-tight mb-4 uppercase text-foreground">
            <span className="text-primary">What Our</span> Customers Say
          </h2>
          <div className="w-24 h-1.5 bg-accent mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((t) => (
            <div
              key={t.id}
              className="bg-[#F7F8F9] rounded-2xl p-6 border border-border flex flex-col"
            >
              <Quote className="w-8 h-8 text-primary/30 mb-4" />
              <p className="text-foreground font-medium leading-relaxed flex-1 mb-6">{t.text}</p>
              <div className="flex items-center gap-3 mt-auto">
                {t.avatarUrl ? (
                  <img
                    src={t.avatarUrl}
                    alt={t.displayName}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                    {t.displayName[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-foreground truncate">{t.displayName}</div>
                  {t.jobTitle && <div className="text-xs text-muted-foreground font-semibold truncate">{t.jobTitle}</div>}
                </div>
              </div>
              {t.rating && (
                <div className="flex items-center gap-1 mt-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-4 h-4 ${i < t.rating! ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
