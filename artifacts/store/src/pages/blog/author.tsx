import { useEffect, useState } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { Post, Author } from "@/components/blog/types";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Loader2 } from "lucide-react";

export default function BlogAuthor() {
  const { slug } = useParams<{ slug: string }>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [author, setAuthor] = useState<Author | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    
    Promise.all([
      fetch(`/api/blog/authors/${slug}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/blog/posts?author=${slug}`).then(r => r.ok ? r.json() : { posts: [] })
    ]).then(([authorData, postData]) => {
      if (authorData) setAuthor(authorData);
      setPosts(postData.posts || []);
    }).finally(() => setLoading(false));
  }, [slug]);

  useSeoMeta({
    title: author ? `Articles by ${author.name} | Blog` : "Author | Blog",
    description: author?.bio
  });

  return (
    <Layout>
      <div className="bg-white py-16 md:py-24 border-b border-border">
        <div className="container mx-auto px-4 md:px-6 max-w-4xl">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
          ) : author ? (
            <div className="flex flex-col md:flex-row items-center md:items-start gap-10 text-center md:text-left">
              {author.avatarUrl ? (
                <img src={author.avatarUrl} alt={author.name} className="w-32 md:w-40 h-32 md:h-40 rounded-full object-cover shadow-lg border-4 border-[#F7F8F9] shrink-0" />
              ) : (
                <div className="w-32 md:w-40 h-32 md:h-40 rounded-full bg-primary flex items-center justify-center text-white font-bold text-5xl shadow-lg border-4 border-[#F7F8F9] shrink-0">
                  {author.name.charAt(0)}
                </div>
              )}
              <div className="flex-1 mt-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground block mb-3">Author</span>
                <h1 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-6">
                  {author.name}
                </h1>
                {author.bio && (
                  <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                    {author.bio}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-10">
              <h1 className="text-4xl font-heading font-bold text-foreground">Author Not Found</h1>
            </div>
          )}
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="flex flex-col xl:flex-row gap-12 lg:gap-16 max-w-[1200px] mx-auto">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-8 border-b border-border pb-4">
              <h3 className="text-2xl font-heading font-bold text-foreground">
                Articles by {author?.name.split(' ')[0]}
              </h3>
              <span className="text-muted-foreground font-bold">{posts.length} published</span>
            </div>
            
            {posts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                {posts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="text-center py-24 bg-white rounded-3xl border border-border shadow-sm">
                <p className="text-muted-foreground text-lg font-bold">No posts published yet.</p>
              </div>
            )}
          </div>
          <div className="xl:w-[360px] shrink-0">
            <NewsletterSignup />
          </div>
        </div>
      </div>
    </Layout>
  );
}