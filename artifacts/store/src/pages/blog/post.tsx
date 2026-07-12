import { useEffect, useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import { Layout } from "@/components/layout";
import { useSeoMeta } from "@/components/blog/useSeoMeta";
import { Post, Comment as BlogComment, CTA, Post as RelatedPost } from "@/components/blog/types";
import { PostCard } from "@/components/blog/PostCard";
import NewsletterSignup from "@/components/blog/NewsletterSignup";
import { pushDataLayer } from "@/lib/analytics";
import { Loader2, ArrowLeft, Clock, Facebook, Twitter, Linkedin, ChevronRight, ChevronLeft, Search } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const [post, setPost] = useState<Post | null>(null);
  const [related, setRelated] = useState<RelatedPost[]>([]);
  const [prevPost, setPrevPost] = useState<{title: string, slug: string} | null>(null);
  const [nextPost, setNextPost] = useState<{title: string, slug: string} | null>(null);
  const [cta, setCta] = useState<CTA | null>(null);
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [commentName, setCommentName] = useState("");
  const [commentEmail, setCommentEmail] = useState("");
  const [commentContent, setCommentContent] = useState("");
  const [commentStatus, setCommentStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(false);
    
    fetch(`/api/blog/posts/${slug}`)
      .then(async r => {
        if (!r.ok) {
          if (r.status === 404) {
            const redir = await fetch(`/api/blog/redirects/${slug}`).catch(() => null);
            if (redir?.ok) {
              const data = await redir.json();
              if (data.toSlug) {
                setLocation(`/blog/${data.toSlug}`, { replace: true });
                return;
              }
            }
          }
          throw new Error("Not found");
        }
        return r.json();
      })
      .then(data => {
        if (!data) return;
        setPost(data.post);
        setRelated(data.related || []);
        setPrevPost(data.prev);
        setNextPost(data.next);
        setCta(data.cta);
        
        pushDataLayer({ 
          event: "blog_post_view",
          post_id: String(data.post.id),
          post_title: data.post.title
        });
        
        if (data.post.allowComments) {
          fetch(`/api/blog/posts/${data.post.slug}/comments`)
            .then(rc => rc.ok ? rc.json() : [])
            .then(setComments)
            .catch(() => {});
        }
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => setLoading(false));
  }, [slug, setLocation]);

  useSeoMeta({
    title: post ? (post.seoTitle || post.title) : "Blog",
    description: post ? (post.seoDescription || post.excerpt) : "",
    canonical: post?.canonicalUrl || (post ? `${window.location.origin}/blog/${post.slug}` : undefined),
    ogImage: post?.ogImageUrl || post?.featuredImageUrl,
    noIndex: post?.noIndex,
    noFollow: post?.noFollow
  });

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!post || !commentName || !commentEmail || !commentContent) return;
    setCommentStatus("loading");
    try {
      const res = await fetch(`/api/blog/posts/${post.slug}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorName: commentName, authorEmail: commentEmail, content: commentContent })
      });
      if (res.ok) {
        setCommentStatus("success");
        setCommentName("");
        setCommentEmail("");
        setCommentContent("");
        pushDataLayer({ event: "comment_submitted", post_id: String(post.id) });
      } else {
        setCommentStatus("error");
      }
    } catch {
      setCommentStatus("error");
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[70vh]">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (error || !post) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-24 text-center max-w-lg min-h-[70vh] flex flex-col justify-center">
          <div className="w-24 h-24 bg-white rounded-3xl border border-border flex items-center justify-center mx-auto mb-8 shadow-sm">
            <Search className="w-10 h-10 text-muted-foreground" />
          </div>
          <h1 className="text-4xl font-heading font-bold mb-6 text-foreground">Post not found</h1>
          <p className="text-muted-foreground text-lg mb-10 leading-relaxed">
            The article you're looking for doesn't exist or has been moved.
          </p>
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-border mb-10">
            <h3 className="font-bold text-foreground mb-6 text-lg">Search our blog</h3>
            <form onSubmit={e => {
              e.preventDefault();
              const q = (e.currentTarget.elements.namedItem('q') as HTMLInputElement).value;
              if (q) setLocation(`/blog/search?q=${encodeURIComponent(q)}`);
            }} className="flex flex-col sm:flex-row gap-3">
              <input name="q" type="search" placeholder="SEO tools, guides..." className="flex-1 h-12 px-5 rounded-xl border border-input focus:outline-none focus:ring-2 focus:ring-primary/30 text-base bg-[#F7F8F9]" />
              <Button type="submit" className="h-12 px-8 rounded-xl bg-primary text-white font-bold hover:bg-primary/90">Search</Button>
            </form>
          </div>
          <Link href="/blog" className="text-primary font-bold hover:underline inline-flex items-center justify-center gap-2 uppercase tracking-wider text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {post && (
        <script 
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Article",
              headline: post.seoTitle || post.title,
              description: post.seoDescription || post.excerpt,
              image: post.featuredImageUrl ? [post.featuredImageUrl] : [],
              datePublished: post.publishedAt,
              dateModified: post.publishedAt,
              author: post.author ? [{
                "@type": "Person",
                name: post.author.name,
                url: `${window.location.origin}/blog/author/${post.author.authorSlug}`
              }] : [],
              publisher: {
                "@type": "Organization",
                name: "Top Rated SEO Tools",
                logo: {
                  "@type": "ImageObject",
                  url: `${window.location.origin}/logo.png`
                }
              }
            })
          }}
        />
      )}

      <article className="bg-[#F7F8F9] pb-20 md:pb-32">
        <header className="container mx-auto px-4 md:px-6 py-12 md:py-24 max-w-4xl text-center">
          <Link href="/blog" className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors mb-10">
            <ArrowLeft className="w-4 h-4" /> Back to Blog
          </Link>
          
          <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
            {post.category && (
              <Link href={`/blog/category/${post.category.slug}`} className="px-4 py-1.5 bg-primary/10 text-primary text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-primary hover:text-white transition-colors">
                {post.category.name}
              </Link>
            )}
            <span className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground">
              <Clock className="w-4 h-4" /> {post.readingTimeMinutes} min read
            </span>
            {post.publishedAt && (
              <span className="text-sm font-bold text-muted-foreground">
                · {format(new Date(post.publishedAt), "MMM d, yyyy")}
              </span>
            )}
          </div>
          
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold tracking-tight text-foreground leading-tight mb-10">
            {post.title}
          </h1>
          
          {post.author && (
            <div className="flex items-center justify-center gap-5">
              <Link href={`/blog/author/${post.author.authorSlug}`}>
                {post.author.avatarUrl ? (
                  <img src={post.author.avatarUrl} alt={post.author.name} className="w-14 h-14 rounded-full object-cover bg-white shadow-sm border border-border" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xl shadow-sm">
                    {post.author.name.charAt(0)}
                  </div>
                )}
              </Link>
              <div className="text-left">
                <Link href={`/blog/author/${post.author.authorSlug}`} className="block font-bold text-foreground text-lg hover:text-primary transition-colors">
                  {post.author.name}
                </Link>
                {post.author.bio && <div className="text-sm font-medium text-muted-foreground mt-0.5">{post.author.bio.slice(0, 60)}...</div>}
              </div>
            </div>
          )}
        </header>

        {post.featuredImageUrl && (
          <div className="container mx-auto px-4 md:px-6 max-w-5xl mb-20">
            <figure className="rounded-[2rem] overflow-hidden shadow-xl border border-border bg-white">
              <img 
                src={post.featuredImageUrl} 
                alt={post.featuredImageAlt || post.title} 
                className="w-full h-auto max-h-[600px] object-cover"
              />
              {post.featuredImageCaption && (
                <figcaption className="p-4 text-center text-sm font-medium text-muted-foreground bg-white border-t border-border">
                  {post.featuredImageCaption}
                </figcaption>
              )}
            </figure>
          </div>
        )}

        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-16 max-w-[1100px] mx-auto">
            <div className="hidden lg:block w-48 shrink-0 relative">
              <div className="sticky top-32 space-y-10">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-5">Share Article</h4>
                  <div className="flex flex-col gap-4">
                    <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted-foreground hover:text-[#1DA1F2] transition-colors font-bold text-sm group">
                      <div className="w-10 h-10 rounded-full bg-white border border-border flex items-center justify-center shadow-sm group-hover:border-[#1DA1F2]/30 transition-colors"><Twitter className="w-4 h-4" /></div> Twitter
                    </a>
                    <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted-foreground hover:text-[#0A66C2] transition-colors font-bold text-sm group">
                      <div className="w-10 h-10 rounded-full bg-white border border-border flex items-center justify-center shadow-sm group-hover:border-[#0A66C2]/30 transition-colors"><Linkedin className="w-4 h-4" /></div> LinkedIn
                    </a>
                    <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 text-muted-foreground hover:text-[#1877F2] transition-colors font-bold text-sm group">
                      <div className="w-10 h-10 rounded-full bg-white border border-border flex items-center justify-center shadow-sm group-hover:border-[#1877F2]/30 transition-colors"><Facebook className="w-4 h-4" /></div> Facebook
                    </a>
                  </div>
                </div>
                
                {post.tags && post.tags.length > 0 && (
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-5">Tags</h4>
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map(tag => (
                        <Link key={tag.id} href={`/blog/tag/${tag.slug}`} className="px-3 py-1.5 rounded-lg bg-white border border-border text-foreground text-xs font-bold hover:border-primary/40 hover:text-primary transition-colors shadow-sm">
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0 bg-white rounded-[2.5rem] p-8 md:p-14 lg:p-16 shadow-sm border border-border">
              <div 
                className="prose prose-lg md:prose-xl prose-slate max-w-none
                  prose-headings:font-heading prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground
                  prose-h2:mt-12 prose-h2:mb-6
                  prose-p:text-muted-foreground prose-p:leading-relaxed prose-p:mb-6
                  prose-a:text-primary prose-a:font-semibold prose-a:no-underline hover:prose-a:underline
                  prose-img:rounded-2xl prose-img:border prose-img:border-border prose-img:shadow-sm
                  prose-blockquote:border-l-[6px] prose-blockquote:border-l-primary prose-blockquote:bg-primary/5 prose-blockquote:py-4 prose-blockquote:px-8 prose-blockquote:rounded-r-2xl prose-blockquote:not-italic prose-blockquote:font-medium prose-blockquote:text-foreground
                  prose-pre:bg-[#1e1e2e] prose-pre:text-[#cdd6f4] prose-pre:rounded-2xl prose-pre:border prose-pre:border-border/50
                  prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:font-semibold prose-code:before:content-none prose-code:after:content-none
                  prose-li:text-muted-foreground prose-ul:list-disc prose-ol:list-decimal"
                dangerouslySetInnerHTML={{ __html: post.content }}
              />

              {cta && (
                <div className="mt-16 bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/20 rounded-3xl p-10 text-center md:text-left flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex-1">
                    <h3 className="text-3xl font-heading font-bold text-foreground mb-4">{cta.name}</h3>
                    <p className="text-muted-foreground text-lg leading-relaxed">{cta.description}</p>
                  </div>
                  <div className="shrink-0 w-full md:w-auto">
                    {cta.productId ? (
                      <Link href={`/products/${cta.productId}`} className="w-full md:w-auto inline-flex items-center justify-center h-14 px-10 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl whitespace-nowrap shadow-md text-lg transition-transform hover:-translate-y-0.5">
                        View Product
                      </Link>
                    ) : cta.ctaCustomUrl ? (
                      <a href={cta.ctaCustomUrl} className="w-full md:w-auto inline-flex items-center justify-center h-14 px-10 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl whitespace-nowrap shadow-md text-lg transition-transform hover:-translate-y-0.5">
                        {cta.ctaCustomLabel || "Learn More"}
                      </a>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="lg:hidden mt-16 pt-10 border-t border-border">
                {post.tags && post.tags.length > 0 && (
                  <div className="mb-8">
                    <div className="flex flex-wrap gap-2">
                      {post.tags.map(tag => (
                        <Link key={tag.id} href={`/blog/tag/${tag.slug}`} className="px-3 py-1.5 rounded-lg bg-[#F7F8F9] border border-border text-foreground text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors">
                          {tag.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-4">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Share:</span>
                  <a href={`https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-[#F7F8F9] border border-border flex items-center justify-center text-muted-foreground hover:text-[#1DA1F2] hover:border-[#1DA1F2]/30 transition-colors shadow-sm"><Twitter className="w-5 h-5" /></a>
                  <a href={`https://www.linkedin.com/shareArticle?mini=true&url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(post.title)}`} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-[#F7F8F9] border border-border flex items-center justify-center text-muted-foreground hover:text-[#0A66C2] hover:border-[#0A66C2]/30 transition-colors shadow-sm"><Linkedin className="w-5 h-5" /></a>
                  <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer" className="w-12 h-12 rounded-full bg-[#F7F8F9] border border-border flex items-center justify-center text-muted-foreground hover:text-[#1877F2] hover:border-[#1877F2]/30 transition-colors shadow-sm"><Facebook className="w-5 h-5" /></a>
                </div>
              </div>
            </div>
            
            <div className="hidden xl:block w-[320px] shrink-0 space-y-10">
              <NewsletterSignup />
            </div>
          </div>
        </div>
      </article>

      {(prevPost || nextPost) && (
        <div className="border-t border-border bg-white py-16">
          <div className="container mx-auto px-4 md:px-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-[1100px] mx-auto">
              {prevPost ? (
                <Link href={`/blog/${prevPost.slug}`} className="group p-8 rounded-3xl border border-border hover:border-primary/40 flex flex-col items-start text-left transition-colors bg-[#F7F8F9] hover:bg-white">
                  <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 group-hover:text-primary transition-colors">
                    <ChevronLeft className="w-4 h-4" /> Previous Post
                  </span>
                  <h4 className="text-xl font-heading font-bold text-foreground line-clamp-2 leading-tight">{prevPost.title}</h4>
                </Link>
              ) : <div />}
              
              {nextPost ? (
                <Link href={`/blog/${nextPost.slug}`} className="group p-8 rounded-3xl border border-border hover:border-primary/40 flex flex-col items-end text-right transition-colors bg-[#F7F8F9] hover:bg-white">
                  <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-4 group-hover:text-primary transition-colors">
                    Next Post <ChevronRight className="w-4 h-4" />
                  </span>
                  <h4 className="text-xl font-heading font-bold text-foreground line-clamp-2 leading-tight">{nextPost.title}</h4>
                </Link>
              ) : <div />}
            </div>
          </div>
        </div>
      )}

      {post.allowComments && (
        <div className="bg-[#F7F8F9] py-20 border-t border-border">
          <div className="container mx-auto px-4 md:px-6 max-w-4xl">
            <h3 className="text-3xl font-heading font-bold text-foreground mb-10 text-center md:text-left">Comments ({comments.length})</h3>
            
            <div className="space-y-6 mb-16">
              {comments.map(comment => (
                <div key={comment.id} className="bg-white p-8 rounded-3xl border border-border shadow-sm flex flex-col sm:flex-row gap-5">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                    {comment.authorName.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-4 mb-3">
                      <span className="font-bold text-foreground text-lg">{comment.authorName}</span>
                      <span className="w-1 h-1 rounded-full bg-border" />
                      <span className="text-sm font-medium text-muted-foreground">{comment.createdAt ? format(new Date(comment.createdAt), "MMM d, yyyy") : ""}</span>
                    </div>
                    <p className="text-muted-foreground text-base leading-relaxed whitespace-pre-wrap">{comment.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <div className="bg-white p-12 rounded-3xl border border-border text-center">
                  <p className="text-muted-foreground text-lg font-medium">No comments yet. Be the first to share your thoughts!</p>
                </div>
              )}
            </div>

            <div className="bg-white p-8 md:p-12 rounded-[2.5rem] border border-border shadow-sm">
              <h4 className="text-2xl font-heading font-bold text-foreground mb-8">Leave a comment</h4>
              {commentStatus === "success" ? (
                <div className="bg-green-50 text-green-700 p-6 rounded-2xl border border-green-200 font-bold text-lg text-center">
                  Thanks! Your comment is awaiting moderation.
                </div>
              ) : (
                <form onSubmit={handleCommentSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-foreground mb-2">Name</label>
                      <input 
                        required 
                        type="text" 
                        value={commentName}
                        onChange={e => setCommentName(e.target.value)}
                        className="w-full h-12 px-5 rounded-xl border border-input bg-[#F7F8F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-foreground mb-2">Email <span className="text-muted-foreground font-medium">(not published)</span></label>
                      <input 
                        required 
                        type="email" 
                        value={commentEmail}
                        onChange={e => setCommentEmail(e.target.value)}
                        className="w-full h-12 px-5 rounded-xl border border-input bg-[#F7F8F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-foreground mb-2">Comment</label>
                    <textarea 
                      required 
                      rows={6}
                      value={commentContent}
                      onChange={e => setCommentContent(e.target.value)}
                      className="w-full p-5 rounded-2xl border border-input bg-[#F7F8F9] focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-colors resize-y"
                    />
                  </div>
                  {commentStatus === "error" && (
                    <p className="text-destructive text-sm font-bold">An error occurred submitting your comment. Please try again.</p>
                  )}
                  <Button type="submit" disabled={commentStatus === "loading"} className="h-14 px-10 rounded-xl text-lg font-bold w-full sm:w-auto">
                    {commentStatus === "loading" ? "Submitting..." : "Post Comment"}
                  </Button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {related.length > 0 && (
        <div className="bg-white py-24 border-t border-border">
          <div className="container mx-auto px-4 md:px-6">
            <h3 className="text-4xl font-heading font-bold text-center text-foreground mb-16">Read Next</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 max-w-[1100px] mx-auto">
              {related.map(post => (
                <PostCard key={post.id} post={post as any} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}