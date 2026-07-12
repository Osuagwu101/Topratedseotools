import { useEffect, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { Layout } from "@/components/layout";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { Post } from "@/components/blog/types";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Loader2, Search } from "lucide-react";

export default function BlogSearch() {
  const searchString = useSearch();
  const [, setLocation] = useLocation();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  
  const searchParams = new URLSearchParams(searchString);
  const q = searchParams.get("q") || "";
  const [queryInput, setQueryInput] = useState(q);

  useEffect(() => {
    setQueryInput(q);
    if (!q) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/blog/search?q=${encodeURIComponent(q)}`)
      .then(r => r.ok ? r.json() : { posts: [] })
      .then(data => setPosts(data.posts || []))
      .finally(() => setLoading(false));
  }, [q]);

  useSeoMeta({
    title: q ? `Search results for "${q}" | Blog` : "Search Blog",
    noIndex: true
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (queryInput.trim()) {
      setLocation(`/blog/search?q=${encodeURIComponent(queryInput.trim())}`);
    }
  };

  return (
    <Layout>
      <div className="bg-white py-16 md:py-24 border-b border-border">
        <div className="container mx-auto px-4 md:px-6 max-w-3xl text-center">
          <h1 className="text-4xl md:text-5xl font-heading font-bold text-foreground mb-10">
            {q ? `Results for "${q}"` : "Search the Blog"}
          </h1>
          <form onSubmit={handleSearch} className="relative w-full max-w-2xl mx-auto shadow-sm">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-6 h-6 text-muted-foreground" />
            <input 
              type="search"
              value={queryInput}
              onChange={e => setQueryInput(e.target.value)}
              placeholder="Search guides, tools, strategies..."
              className="w-full h-16 pl-16 pr-5 rounded-[1.25rem] border border-input bg-[#F7F8F9] text-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors"
            />
            <button type="submit" className="absolute right-2 top-2 bottom-2 bg-primary hover:bg-primary/90 text-white font-bold px-8 rounded-xl transition-colors">
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6 py-16 md:py-24">
        {loading ? (
          <div className="flex justify-center py-32"><Loader2 className="w-10 h-10 animate-spin text-primary" /></div>
        ) : (
          <div className="flex flex-col xl:flex-row gap-12 lg:gap-16 max-w-[1200px] mx-auto">
            <div className="flex-1">
              <div className="mb-8 border-b border-border pb-4">
                <span className="text-muted-foreground font-bold">{posts.length} articles found</span>
              </div>
              
              {posts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  {posts.map(post => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              ) : (
                <div className="text-center py-32 bg-white rounded-[2rem] border border-border shadow-sm px-6">
                  <div className="w-20 h-20 bg-[#F7F8F9] rounded-3xl flex items-center justify-center mx-auto mb-6">
                    <Search className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-2xl font-heading font-bold text-foreground mb-3">No results found</h3>
                  <p className="text-muted-foreground text-lg max-w-md mx-auto">We couldn't find any articles matching your search. Try adjusting your keywords.</p>
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