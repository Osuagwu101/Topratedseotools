import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../BlogAdminPanel";
import { Loader2, Check, X, ShieldAlert, Trash2, Search, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface BlogComment {
  id: number;
  postId: number;
  authorName: string;
  authorEmail: string;
  content: string;
  status: "pending" | "approved" | "spam" | "rejected";
  parentId: number | null;
  createdAt: string;
  postSlug: string | null;
  postTitle: string | null;
}

export default function CommentsPanel({ staff }: { staff: StaffUser }) {
  const { toast } = useToast();
  const [comments, setComments] = useState<BlogComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [actionId, setActionId] = useState<number | null>(null);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blog/comments?status=${statusFilter}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setComments(data);
    } catch (err: any) {
      toast({ title: "Error fetching comments", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComments();
  }, [statusFilter]);

  const updateStatus = async (id: number, status: "approved" | "spam" | "rejected") => {
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/blog/comments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status })
      });
      if (!res.ok) throw new Error(await res.text());
      
      // Optimistically remove from list if it no longer matches the filter, or update it
      if (statusFilter !== "all" && statusFilter !== status) {
        setComments(prev => prev.filter(c => c.id !== id));
      } else {
        setComments(prev => prev.map(c => c.id === id ? { ...c, status } : c));
      }
      toast({ title: `Comment ${status}` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  const deleteComment = async (id: number) => {
    if (!confirm("Are you sure you want to permanently delete this comment?")) return;
    setActionId(id);
    try {
      const res = await fetch(`/api/admin/blog/comments/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      setComments(prev => prev.filter(c => c.id !== id));
      toast({ title: "Comment deleted" });
    } catch (err: any) {
      toast({ title: "Error deleting comment", description: err.message, variant: "destructive" });
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-xl font-heading font-bold text-foreground">Comments</h2>
          <p className="text-sm text-muted-foreground mt-1">Moderate reader comments.</p>
        </div>
        
        <div className="flex items-center bg-gray-100 p-1 rounded-lg">
          {(["pending", "approved", "rejected", "spam", "all"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-md transition-colors ${statusFilter === tab ? "bg-white text-primary shadow-sm" : "text-gray-500 hover:text-gray-900"}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 border border-gray-200 rounded-xl overflow-hidden bg-white flex flex-col">
        {loading ? (
          <div className="flex-1 flex justify-center items-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : comments.length === 0 ? (
          <div className="flex-1 flex justify-center items-center p-12 text-muted-foreground text-sm font-semibold">
            No {statusFilter !== "all" ? statusFilter : ""} comments found.
          </div>
        ) : (
          <div className="overflow-y-auto divide-y divide-gray-100 flex-1 max-h-[600px]">
            {comments.map(comment => (
              <div key={comment.id} className="p-4 sm:p-5 hover:bg-gray-50 transition-colors flex flex-col sm:flex-row gap-4">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-foreground truncate">
                      {comment.authorName} <span className="text-muted-foreground font-normal">({comment.authorEmail})</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                      comment.status === 'approved' ? 'bg-green-100 text-green-700' :
                      comment.status === 'spam' ? 'bg-red-100 text-red-700' :
                      comment.status === 'rejected' ? 'bg-gray-200 text-gray-700' :
                      'bg-yellow-100 text-yellow-700'
                    }`}>
                      {comment.status}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-800 bg-gray-50/50 p-3 rounded-md border border-gray-100 whitespace-pre-wrap break-words">
                    {comment.content}
                  </div>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground font-medium">
                    <span>{new Date(comment.createdAt).toLocaleString()}</span>
                    {comment.postSlug && (
                      <Link href={`/blog/${comment.postSlug}`} target="_blank" className="flex items-center gap-1 hover:text-primary transition-colors">
                        <ExternalLink className="w-3.5 h-3.5" /> {comment.postTitle || "View Post"}
                      </Link>
                    )}
                  </div>
                </div>

                <div className="flex sm:flex-col gap-2 shrink-0 justify-end sm:justify-start">
                  {comment.status !== "approved" && (
                    <Button size="sm" variant="outline" className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200" onClick={() => updateStatus(comment.id, "approved")} disabled={actionId === comment.id}>
                      <Check className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Approve</span>
                    </Button>
                  )}
                  {comment.status !== "rejected" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(comment.id, "rejected")} disabled={actionId === comment.id}>
                      <X className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Reject</span>
                    </Button>
                  )}
                  {comment.status !== "spam" && (
                    <Button size="sm" variant="outline" className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200" onClick={() => updateStatus(comment.id, "spam")} disabled={actionId === comment.id}>
                      <ShieldAlert className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Spam</span>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200" onClick={() => deleteComment(comment.id)} disabled={actionId === comment.id}>
                    <Trash2 className="w-4 h-4 sm:mr-1.5" /> <span className="hidden sm:inline">Delete</span>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
