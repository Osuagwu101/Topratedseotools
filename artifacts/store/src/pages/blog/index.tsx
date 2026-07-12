import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { Post, Category } from "@/components/blog/types";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

export default function BlogHome() {
  const [, setLocation] = useLocation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  
  const LIMIT = 9;

  useSeoMeta({
    title: "Blog | Top Rated SEO Tools",
    description: "Expert insights, tool reviews, and strategies for SEO professionals and marketers."
  });

  useEffect(() => {
    fetch("/api/blog/categories")
      .then(r => r.ok ? r.json() : [])
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/blog/posts?page=${page}&limit=${LIMIT}`)
      .then(r => r.ok ? r.json() : { posts: [], total: 0 })
      .then(data => {
        setPosts(data.posts || []);
        setTotal(data.total || 0);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setLocation(`/blog/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const featuredPost = page === 1 && posts.length > 0 ? (posts.find(p => p.isFeatured) || posts[0]) : undefined;
  const gridPosts = page === 1 ? posts.filter(p => p.id !== featuredPost?.id) : posts;
  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Layout>
      <div className="bg-white border-b border-border py-16 md:py-24">
        <div className="container mx-auto px-4 md:px-6">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold tracking-tight text-foreground">
              The SEO Tool <span className="text-primary">Playbook</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground leading-relaxed">
              In-depth reviews, comparative analysis, and practical workflows for the industry's top SEO software. Make informed decisions for your tech stack.
            </p>
            
            <div className="pt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <form onSubmit={handleSearch} className="relative w-full sm:w-[28rem]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <input 
                  type="search"
                  placeholder="Search articles, guides, tools..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full h-14 pl-12 pr-4 rounded-xl border border-input bg-[#F7F8F9] text-base focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors"
                />
              </form>
            </div>
            
            {categories.length > 0 && (
              <div className="pt-4 flex flex-wrap items-center justify-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-2">Topics:</span>
                {categories.map(cat => (
                  <Link key={cat.id} href={`/blog/category/${cat.slug}`} className="px-3 py-1.5 rounded-full bg-[#F7F8F9] border border-transparent text-sm font-medium hover:border-primary/20 hover:text-primary transition-colors text-foreground">
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-12 md:py-20">
        {loading && page === 1 ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {page === 1 && featuredPost && (
              <div className="mb-20">
                <div className="group relative rounded-[2rem] overflow-hidden bg-white border border-border shadow-sm flex flex-col lg:flex-row min-h-[440px]">
                  <Link href={`/blog/${featuredPost.slug}`} className="lg:w-[55%] relative overflow-hidden bg-muted aspect-video lg:aspect-auto">
                    {featuredPost.featuredImageUrl ? (
                      <img 
                        src={featuredPost.featuredImageUrl} 
                        alt={featuredPost.title}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#F7F8F9] flex items-center justify-center text-muted-foreground/30 font-heading text-2xl uppercase tracking-widest font-bold">Featured</div>
                    )}
                  </Link>
                  <div className="lg:w-[45%] p-8 md:p-12 lg:p-16 flex flex-col justify-center">
                    {featuredPost.category && (
                      <Link href={`/blog/category/${featuredPost.category.slug}`} className="self-start inline-flex items-center px-4 py-1.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest rounded-full mb-6 hover:bg-primary hover:text-white transition-colors">
                        {featuredPost.category.name}
                      </Link>
                    )}
                    <Link href={`/blog/${featuredPost.slug}`} className="group-hover:text-primary transition-colors">
                      <h2 className="text-3xl md:text-4xl lg:text-5xl font-heading font-bold text-foreground leading-tight mb-6">
                        {featuredPost.title}
                      </h2>
                      <p className="text-muted-foreground text-lg leading-relaxed mb-10 line-clamp-3">
                        {featuredPost.excerpt}
                      </p>
                    </Link>
                    
                    <div className="mt-auto flex items-center gap-4">
                      {featuredPost.author && (
                        <Link href={`/blog/author/${featuredPost.author.authorSlug}`} className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                          {featuredPost.author.avatarUrl ? (
                            <img src={featuredPost.author.avatarUrl} alt={featuredPost.author.name} className="w-12 h-12 rounded-full object-cover bg-muted" />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                              {featuredPost.author.name.charAt(0)}
                            </div>
                          )}
                          <div>
                            <div className="text-base font-bold text-foreground">{featuredPost.author.name}</div>
                            <div className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                              {featuredPost.publishedAt ? new Date(featuredPost.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric'}) : "Draft"} 
                              <span className="w-1 h-1 rounded-full bg-border" /> 
                              {featuredPost.readingTimeMinutes} min read
                            </div>
                          </div>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col xl:flex-row gap-12 lg:gap-16">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-8 pb-4 border-b border-border">
                  <h3 className="text-2xl font-heading font-bold text-foreground">Latest Articles</h3>
                </div>
                
                {gridPosts.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                    {gridPosts.map(post => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-20 text-muted-foreground bg-white rounded-3xl border border-border">
                    No posts available.
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
              
              <div className="xl:w-[360px] shrink-0 space-y-8">
                <NewsletterSignup />
                
                {categories.length > 0 && (
                  <div className="bg-white border border-border rounded-3xl p-8 shadow-sm">
                    <h3 className="text-lg font-heading font-bold text-foreground mb-6">Explore Topics</h3>
                    <div className="flex flex-col gap-2">
                      {categories.map(cat => (
                        <Link key={cat.id} href={`/blog/category/${cat.slug}`} className="flex items-center justify-between p-3 rounded-xl hover:bg-[#F7F8F9] transition-colors group">
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{cat.name}</span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}