import { Link } from "wouter";
import { format } from "date-fns";
import { Post } from "./types";
import { Clock, ArrowUpRight } from "lucide-react";

export function PostCard({ post }: { post: Post }) {
  return (
    <div className="group flex flex-col bg-white border border-border rounded-2xl overflow-hidden hover:shadow-md hover:border-primary/20 transition-all duration-300">
      <div className="relative">
        <Link href={`/blog/${post.slug}`} className="block relative aspect-[16/9] overflow-hidden bg-muted">
          {post.featuredImageUrl ? (
            <img 
              src={post.featuredImageUrl} 
              alt={post.featuredImageAlt || post.title}
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/50 bg-[#F7F8F9]">
              <span className="font-heading font-medium tracking-wider uppercase text-sm">Top Rated SEO</span>
            </div>
          )}
        </Link>
        {post.category && (
          <div className="absolute top-4 left-4 z-10">
            <Link href={`/blog/category/${post.category.slug}`} className="inline-flex items-center px-3 py-1 bg-white/95 backdrop-blur-sm text-foreground text-[10px] font-bold uppercase tracking-wider rounded-full shadow-sm hover:bg-primary hover:text-white transition-colors">
              {post.category.name}
            </Link>
          </div>
        )}
      </div>
      
      <div className="flex flex-col flex-1 p-5 sm:p-6">
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3 font-medium">
          {post.publishedAt ? format(new Date(post.publishedAt), "MMM d, yyyy") : "Draft"}
          <span className="w-1 h-1 rounded-full bg-border" />
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {post.readingTimeMinutes} min read
          </span>
        </div>
        
        <Link href={`/blog/${post.slug}`} className="group-hover:text-primary transition-colors flex-1">
          <h3 className="text-xl font-heading font-bold text-foreground leading-tight mb-2 line-clamp-2">
            {post.title}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-3 mb-4 leading-relaxed">
            {post.excerpt}
          </p>
        </Link>
        
        {post.author && (
          <div className="mt-auto pt-4 border-t border-border flex items-center justify-between">
            <Link href={`/blog/author/${post.author.authorSlug}`} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
              {post.author.avatarUrl ? (
                <img src={post.author.avatarUrl} alt={post.author.name} className="w-8 h-8 rounded-full object-cover bg-muted" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white font-bold text-xs">
                  {post.author.name.charAt(0)}
                </div>
              )}
              <span className="text-sm font-semibold text-foreground">{post.author.name}</span>
            </Link>
            <Link href={`/blog/${post.slug}`} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground group-hover:bg-primary group-hover:text-white transition-colors">
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}