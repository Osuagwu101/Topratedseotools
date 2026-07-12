import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { Post, Tag } from "@/components/blog/types";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const LIMIT = 9;

export default function BlogTag() {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setPage(1);
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    
    Promise.all([
      fetch(`/api/blog/tags`).then(r => r.ok ? r.json() : []),
      fetch(`/api/blog/posts?tag=${slug}&page=${page}&limit=${LIMIT}`).then(r => r.ok ? r.json() : { posts: [], total: 0 })
    ]).then(([tags, data]) => {
      const t = tags.find((t: Tag) => t.slug === slug);
      if (t) setTag(t);
      setPosts(data.posts || []);
      setTotal(data.total || 0);
    }).finally(() => setLoading(false));
  }, [slug, page]);

  const totalPages = Math.ceil(total / LIMIT);

  useSeoMeta({
    title: tag ? `Tag: ${tag.name} | Blog` : "Tag | Blog",
  });

  return (
    <Layout>
      <div className="bg-white py-16 md:py-24 border-b border-border">
        <div className="container mx-auto px-4 md:px-6 text-center max-w-3xl">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-4">Tag</span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-foreground">
            #{tag ? tag.name : slug}
          </h1>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
        ) : (
          <div className="flex flex-col xl:flex-row gap-12 lg:gap-16 max-w-[1200px] mx-auto">
            <div className="flex-1">
              <div className="mb-8 pb-4 border-b border-border">
                <span className="text-muted-foreground font-bold">{total} articles</span>
              </div>
              {posts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  {posts.map(post => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-24 bg-white rounded-3xl border border-border shadow-sm">
                  <p className="text-muted-foreground text-lg font-bold">No posts found with this tag.</p>
                </div>
              )}

              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-16 pt-8 border-t border-border">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-12 h-12 rounded-full border border-border bg-white flex items-center justify-center text-foreground hover:border-primary hover:text-primary disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <span className="text-sm font-bold tracking-wider text-muted-foreground uppercase px-4">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-12 h-12 rounded-full border border-border bg-white flex items-center justify-center text-foreground hover:border-primary hover:text-primary disabled:opacity-50 disabled:pointer-events-none transition-colors shadow-sm"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
            <div className="xl:w-[360px] shrink-0">
              <NewsletterSignup />
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}