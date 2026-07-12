import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { Post, Tag } from "@/components/blog/types";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Loader2 } from "lucide-react";

export default function BlogTag() {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [tag, setTag] = useState<Tag | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    
    Promise.all([
      fetch(`/api/blog/tags`).then(r => r.ok ? r.json() : []),
      fetch(`/api/blog/posts?tag=${slug}`).then(r => r.ok ? r.json() : { posts: [] })
    ]).then(([tags, data]) => {
      const t = tags.find((t: Tag) => t.slug === slug);
      if (t) setTag(t);
      setPosts(data.posts || []);
    }).finally(() => setLoading(false));
  }, [slug]);

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
                <span className="text-muted-foreground font-bold">{posts.length} articles</span>
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