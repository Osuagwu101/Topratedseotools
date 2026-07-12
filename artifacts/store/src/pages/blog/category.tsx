import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { Post, Category } from "@/components/blog/types";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Loader2 } from "lucide-react";

export default function BlogCategory() {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    
    Promise.all([
      fetch(`/api/blog/categories`).then(r => r.ok ? r.json() : []),
      fetch(`/api/blog/posts?category=${slug}`).then(r => r.ok ? r.json() : { posts: [] })
    ]).then(([categories, data]) => {
      const cat = categories.find((c: Category) => c.slug === slug);
      if (cat) setCategory(cat);
      setPosts(data.posts || []);
    }).finally(() => setLoading(false));
  }, [slug]);

  useSeoMeta({
    title: category ? `${category.name} | Blog` : "Category | Blog",
    description: category?.description || `Articles about ${category?.name}`
  });

  return (
    <Layout>
      <div className="bg-white py-16 md:py-24 border-b border-border">
        <div className="container mx-auto px-4 md:px-6 text-center max-w-3xl">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-4">Topic</span>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-foreground mb-6">
            {category ? category.name : "Category"}
          </h1>
          {category?.description && (
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              {category.description}
            </p>
          )}
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
                  <p className="text-muted-foreground text-lg font-bold">No posts found in this category.</p>
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