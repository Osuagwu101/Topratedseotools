import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../BlogAdminPanel";
import { Loader2, Plus, Edit2, Trash2, Tag, Folder } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface BlogCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
}

interface BlogTag {
  id: number;
  name: string;
  slug: string;
}

export default function TaxonomyPanel({ staff }: { staff: StaffUser }) {
  const { toast } = useToast();
  const [categories, setCategories] = useState<BlogCategory[]>([]);
  const [tags, setTags] = useState<BlogTag[]>([]);
  const [loading, setLoading] = useState(true);

  // Category State
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<BlogCategory | null>(null);
  const [catForm, setCatForm] = useState({ name: "", description: "" });
  const [savingCat, setSavingCat] = useState(false);

  // Tag State
  const [tagInput, setTagInput] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [deletingTagId, setDeletingTagId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const [catRes, tagRes] = await Promise.all([
        fetch("/api/admin/blog/categories", { credentials: "include" }),
        fetch("/api/admin/blog/tags", { credentials: "include" })
      ]);
      
      if (!catRes.ok) throw new Error(await catRes.text());
      if (!tagRes.ok) throw new Error(await tagRes.text());

      setCategories(await catRes.json());
      setTags(await tagRes.json());
    } catch (err: any) {
      toast({ title: "Error fetching taxonomy", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Category Actions
  const openNewCat = () => {
    setEditingCat(null);
    setCatForm({ name: "", description: "" });
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: BlogCategory) => {
    setEditingCat(cat);
    setCatForm({ name: cat.name, description: cat.description || "" });
    setCatDialogOpen(true);
  };

  const handleSaveCat = async () => {
    if (!catForm.name) return;
    setSavingCat(true);
    try {
      const url = editingCat ? `/api/admin/blog/categories/${editingCat.id}` : "/api/admin/blog/categories";
      const method = editingCat ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(catForm)
      });

      if (!res.ok) throw new Error(await res.text());
      
      toast({ title: editingCat ? "Category updated" : "Category created" });
      setCatDialogOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingCat(false);
    }
  };

  const handleDeleteCat = async (id: number) => {
    if (!confirm("Are you sure you want to delete this category? Posts in this category will be uncategorized.")) return;
    try {
      const res = await fetch(`/api/admin/blog/categories/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      setCategories(prev => prev.filter(c => c.id !== id));
      toast({ title: "Category deleted" });
    } catch (err: any) {
      toast({ title: "Error deleting category", description: err.message, variant: "destructive" });
    }
  };

  // Tag Actions
  const handleAddTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagInput.trim()) return;
    setAddingTag(true);
    try {
      const res = await fetch("/api/admin/blog/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: tagInput.trim() })
      });
      if (!res.ok) throw new Error(await res.text());
      
      const newTag = await res.json();
      setTags(prev => {
        if (prev.find(t => t.id === newTag.id)) return prev;
        return [...prev, newTag];
      });
      setTagInput("");
      toast({ title: "Tag added" });
    } catch (err: any) {
      toast({ title: "Error adding tag", description: err.message, variant: "destructive" });
    } finally {
      setAddingTag(false);
    }
  };

  const handleDeleteTag = async (id: number) => {
    setDeletingTagId(id);
    try {
      const res = await fetch(`/api/admin/blog/tags/${id}`, {
        method: "DELETE",
        credentials: "include"
      });
      if (!res.ok) throw new Error(await res.text());
      setTags(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      toast({ title: "Error deleting tag", description: err.message, variant: "destructive" });
    } finally {
      setDeletingTagId(null);
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="p-6">
      <div className="grid md:grid-cols-2 gap-8">
        
        {/* Categories */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              <Folder className="w-5 h-5 text-primary" /> Categories
            </h2>
            <Button size="sm" onClick={openNewCat} className="font-bold gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Add
            </Button>
          </div>

          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
            {categories.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No categories found.</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {categories.map(cat => (
                  <div key={cat.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                    <div>
                      <div className="font-bold text-foreground text-sm">{cat.name}</div>
                      {cat.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{cat.description}</div>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => openEditCat(cat)} className="h-8 px-2 text-gray-500 hover:text-primary">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteCat(cat.id)} className="h-8 px-2 text-gray-500 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tags */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-heading font-bold text-foreground flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" /> Tags
            </h2>
          </div>

          <form onSubmit={handleAddTag} className="flex gap-2 mb-4">
            <Input 
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="New tag name..."
              className="bg-white"
            />
            <Button type="submit" disabled={addingTag || !tagInput.trim()} className="shrink-0 font-bold">
              {addingTag ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </form>

          <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-wrap gap-2">
            {tags.length === 0 ? (
              <div className="w-full text-center text-muted-foreground text-sm py-4">No tags found.</div>
            ) : (
              tags.map(tag => (
                <div key={tag.id} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-sm font-semibold text-gray-700 group border border-gray-200">
                  {tag.name}
                  <button 
                    onClick={() => handleDeleteTag(tag.id)} 
                    disabled={deletingTagId === tag.id}
                    className="text-gray-400 hover:text-red-500 focus:outline-none ml-1"
                  >
                    {deletingTagId === tag.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCat ? "Edit Category" : "New Category"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Name</label>
              <Input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. SEO Tips" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Description (Optional)</label>
              <Textarea value={catForm.description} onChange={e => setCatForm(f => ({ ...f, description: e.target.value }))} className="resize-none h-20" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)} disabled={savingCat}>Cancel</Button>
            <Button onClick={handleSaveCat} disabled={savingCat || !catForm.name}>
              {savingCat && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Save Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
