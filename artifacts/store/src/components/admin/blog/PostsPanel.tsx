import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../BlogAdminPanel";
import { Loader2, Plus, Search, Edit2, Trash2, Globe, Clock, CheckCircle2, Copy } from "lucide-react";
import PostEditor from "./PostEditor";
import { Link } from "wouter";

interface BlogPostSummary {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "in_review" | "scheduled" | "published" | "archived";
  authorId: number;
  categoryId: number | null;
  publishedAt: string | null;
  updatedAt: string;
  viewCount: number;
}

export default function PostsPanel({ staff, products }: { staff: StaffUser; products: any[] }) {
  const { toast } = useToast();
  const [posts, setPosts] = useState<BlogPostSummary[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Editor State
  const [editingPostId, setEditingPostId] = useState<number | "new" | null>(null);
  
  const fetchPosts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.append("status", statusFilter);
      if (searchQuery) params.append("q", searchQuery);
      // Authors can only see their own posts
      if (staff.role === "author") params.append("authorId", staff.id.toString());
      
      const res = await fetch(`/api/admin/blog/posts?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setPosts(data);
    } catch (err: any) {
      toast({ title: "Error fetching posts", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, [statusFilter, searchQuery, editingPostId]); // Re-fetch when returning from editor

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/blog/posts/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: "Post deleted" });
      setPosts(prev => prev.filter(p => p.id !== id));
    } catch (err: any) {
      toast({ title: "Error deleting post", description: err.message, variant: "destructive" });
    }
  };

  const handleDuplicate = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/blog/posts/${id}/duplicate`, {
        method: "POST",
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      const newPost = await res.json();
      toast({ title: "Post duplicated" });
      setEditingPostId(newPost.id); // Open the duplicate
    } catch (err: any) {
      toast({ title: "Error duplicating post", description: err.message, variant: "destructive" });
    }
  };

  if (editingPostId !== null) {
    return (
      <PostEditor 
        postId={editingPostId} 
        staff={staff} 
        products={products}
        onBack={() => setEditingPostId(null)} 
      />
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700"><CheckCircle2 className="w-3 h-3" /> Published</span>;
      case "draft": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-gray-100 text-gray-700">Draft</span>;
      case "in_review": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-yellow-100 text-yellow-700">In Review</span>;
      case "scheduled": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-700"><Clock className="w-3 h-3" /> Scheduled</span>;
      case "archived": return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">Archived</span>;
      default: return null;
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Posts</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {staff.role === "author" ? "Manage your articles." : "Manage all blog articles."}
          </p>
        </div>
        
        <Button onClick={() => setEditingPostId("new")} className="font-bold gap-2">
          <Plus className="w-4 h-4" /> New Post
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="flex items-center bg-gray-100 p-1 rounded-lg overflow-x-auto w-full sm:w-auto">
          {(["all", "published", "draft", "in_review", "scheduled"].map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors whitespace-nowrap ${statusFilter === tab ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
            >
              {tab.replace("_", " ")}
            </button>
          )))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="Search titles..." 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
        </div>
      </div>

      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
        {loading ? (
          <div className="flex-1 flex justify-center items-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : posts.length === 0 ? (
          <div className="flex-1 flex flex-col justify-center items-center p-12 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-gray-300" />
            </div>
            <h3 className="text-lg font-bold text-foreground">No posts found</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">Try adjusting your filters or search query.</p>
            <Button onClick={() => setEditingPostId("new")} variant="outline" className="font-bold">Create your first post</Button>
          </div>
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500 border-b border-gray-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 min-w-[300px]">Title</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-right">Views</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {posts.map(post => (
                  <tr key={post.id} className="bg-white hover:bg-gray-50/50 transition-colors group">
                    <td className="px-4 py-3">
                      <button onClick={() => setEditingPostId(post.id)} className="font-bold text-foreground hover:text-primary text-left transition-colors">
                        {post.title}
                      </button>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-[300px]">/{post.slug}</div>
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(post.status)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {post.status === 'published' && post.publishedAt 
                        ? new Date(post.publishedAt).toLocaleDateString() 
                        : `Updated ${new Date(post.updatedAt).toLocaleDateString()}`}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-semibold text-gray-600">
                      {post.viewCount > 0 ? post.viewCount.toLocaleString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {post.status === "published" && (
                          <Link href={`/blog/${post.slug}`} target="_blank" className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded">
                            <Globe className="w-4 h-4" />
                          </Link>
                        )}
                        <button onClick={() => handleDuplicate(post.id)} className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded" title="Duplicate">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingPostId(post.id)} className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/10 rounded" title="Edit">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(post.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
