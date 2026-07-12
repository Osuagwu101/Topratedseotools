import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../BlogAdminPanel";
import { Loader2, Upload, Search, Trash2, Edit2, Copy } from "lucide-react";

export interface BlogMedia {
  id: number;
  url: string;
  originalFilename: string;
  altText: string | null;
  caption: string | null;
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  mimeType: string;
  uploadedBy: number | null;
  createdAt: string;
  usedInPosts?: { id: number; title: string }[];
}

export default function MediaLibrary({ staff, onSelect, mode = "manage" }: { staff: StaffUser, onSelect?: (media: BlogMedia) => void, mode?: "manage" | "picker" }) {
  const { toast } = useToast();
  const [media, setMedia] = useState<BlogMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  
  const [editMedia, setEditMedia] = useState<BlogMedia | null>(null);
  const [editAlt, setEditAlt] = useState("");
  const [editCaption, setEditCaption] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState<{ id: number; usedIn: {id: number; title: string}[] } | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchMedia = async () => {
    try {
      const qs = query ? `?q=${encodeURIComponent(query)}` : "";
      const res = await fetch(`/api/admin/blog/media${qs}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setMedia(data);
    } catch (err: any) {
      toast({ title: "Error fetching media", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMedia();
  }, [query]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Quick validation (server allows 12MB)
    if (file.size > 12 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max size is 12MB", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("kind", "content");
      
      const res = await fetch("/api/admin/blog/media/upload", {
        method: "POST",
        credentials: "include",
        body: formData
      });
      
      if (!res.ok) throw new Error(await res.text() || "Upload failed");
      
      const newMedia = await res.json();
      setMedia(prev => [newMedia, ...prev]);
      toast({ title: "Image uploaded successfully" });
      
      if (mode === "picker" && onSelect) {
        onSelect(newMedia);
      }
    } catch (err: any) {
      toast({ title: "Upload Error", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSaveEdit = async () => {
    if (!editMedia) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/admin/blog/media/${editMedia.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ altText: editAlt, caption: editCaption }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setMedia(prev => prev.map(m => m.id === updated.id ? updated : m));
      setEditMedia(null);
      toast({ title: "Media details updated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: number, force = false) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/blog/media/${id}${force ? '?force=true' : ''}`, {
        method: "DELETE",
        credentials: "include"
      });
      
      if (res.status === 409) {
        // Used in posts, show confirm dialog
        const data = await res.json();
        setForceDeleteConfirm({ id, usedIn: data.usedInPosts || [] });
        return;
      }
      
      if (!res.ok) throw new Error(await res.text());
      
      setMedia(prev => prev.filter(m => m.id !== id));
      setForceDeleteConfirm(null);
      toast({ title: "Media deleted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  function copyToClipboard(url: string) {
    navigator.clipboard.writeText(url);
    toast({ title: "URL copied to clipboard" });
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className={mode === "manage" ? "p-6" : ""}>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {mode === "manage" && (
          <div>
            <h2 className="text-xl font-heading font-bold text-foreground">Media Library</h2>
            <p className="text-sm text-muted-foreground mt-1">Manage images used in blog posts.</p>
          </div>
        )}
        
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input 
              placeholder="Search images..." 
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pl-9 h-10"
            />
          </div>
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="font-bold whitespace-nowrap gap-2 shrink-0">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </Button>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handleUpload} />
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      ) : media.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-muted-foreground font-semibold">No media found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {media.map((item) => (
            <div key={item.id} className="group relative bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-primary/50 transition-colors flex flex-col">
              <div 
                className={`relative aspect-square bg-gray-50 flex items-center justify-center p-2 cursor-pointer ${mode === 'picker' ? 'hover:opacity-80' : ''}`}
                onClick={() => { if (mode === "picker" && onSelect) onSelect(item); }}
              >
                <img src={item.url} alt={item.altText || item.originalFilename} className="max-w-full max-h-full object-contain" loading="lazy" />
              </div>
              <div className="p-3 text-xs flex-1 flex flex-col">
                <p className="font-bold text-foreground truncate" title={item.originalFilename}>{item.originalFilename}</p>
                <p className="text-muted-foreground mt-0.5">{item.width && item.height ? `${item.width}×${item.height} • ` : ''}{formatBytes(item.fileSizeBytes)}</p>
                
                {mode === "manage" && (
                  <div className="mt-auto pt-3 flex items-center justify-between gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditMedia(item); setEditAlt(item.altText || ""); setEditCaption(item.caption || ""); }} className="text-gray-500 hover:text-primary transition-colors" title="Edit Alt/Caption">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => copyToClipboard(item.url)} className="text-gray-500 hover:text-primary transition-colors" title="Copy URL">
                      <Copy className="w-4 h-4" />
                    </button>
                    {staff.role !== "author" && (
                      <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="text-gray-500 hover:text-red-600 transition-colors" title="Delete">
                        {deletingId === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!editMedia} onOpenChange={(o) => !o && setEditMedia(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Image Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {editMedia && (
              <div className="flex gap-4">
                <div className="w-24 h-24 bg-gray-50 rounded-lg flex items-center justify-center border border-gray-100 p-1">
                  <img src={editMedia.url} className="max-w-full max-h-full object-contain" alt="" />
                </div>
                <div className="flex-1 text-xs text-muted-foreground space-y-1">
                  <p><strong className="text-foreground">Filename:</strong> {editMedia.originalFilename}</p>
                  <p><strong className="text-foreground">Dimensions:</strong> {editMedia.width}×{editMedia.height}px</p>
                  <p><strong className="text-foreground">Size:</strong> {formatBytes(editMedia.fileSizeBytes)}</p>
                  <p><strong className="text-foreground">URL:</strong> <a href={editMedia.url} target="_blank" rel="noreferrer" className="text-primary hover:underline truncate inline-block max-w-[200px] align-bottom">{editMedia.url}</a></p>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Alt Text</label>
              <Input value={editAlt} onChange={e => setEditAlt(e.target.value)} placeholder="Description for screen readers" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Caption</label>
              <Input value={editCaption} onChange={e => setEditCaption(e.target.value)} placeholder="Image caption" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMedia(null)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={savingEdit}>
              {savingEdit && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!forceDeleteConfirm} onOpenChange={(o) => !o && setForceDeleteConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Image is in use</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm mb-4">This image is currently used in the following posts:</p>
            <ul className="list-disc pl-5 text-sm font-semibold mb-4 space-y-1">
              {forceDeleteConfirm?.usedIn.map(p => (
                <li key={p.id}>{p.title}</li>
              ))}
            </ul>
            <p className="text-sm font-bold text-red-600">Deleting it will break the image in these posts. Are you sure?</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setForceDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => forceDeleteConfirm && handleDelete(forceDeleteConfirm.id, true)} disabled={!!deletingId}>
              {deletingId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Force Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
