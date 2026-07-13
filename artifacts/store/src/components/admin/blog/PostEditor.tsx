import { useState, useEffect, useRef } from "react";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import LinkExtension from '@tiptap/extension-link';
import ImageExtension from '@tiptap/extension-image';
import { Table as TableExtension } from '@tiptap/extension-table';
import TableRowExtension from '@tiptap/extension-table-row';
import TableHeaderExtension from '@tiptap/extension-table-header';
import TableCellExtension from '@tiptap/extension-table-cell';
import PlaceholderExtension from '@tiptap/extension-placeholder';
import UnderlineExtension from '@tiptap/extension-underline';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../BlogAdminPanel";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import MediaLibrary from "./MediaLibrary";
import AiAssistantPanel from "./seo-generator/AiAssistantPanel";
import { 
  Loader2, ArrowLeft, Save, Globe, Eye, Image as ImageIcon, 
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, 
  Heading2, Heading3, Heading4, List, ListOrdered, Quote, 
  Link2, Link2Off, Code, Undo, Redo, Table as TableIcon,
  Trash2, Send, Sparkles, AlertTriangle
} from "lucide-react";

export default function PostEditor({ 
  postId, 
  staff, 
  products,
  onBack 
}: { 
  postId: number | "new", 
  staff: StaffUser, 
  products: any[],
  onBack: () => void 
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(postId !== "new");
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [mediaTarget, setMediaTarget] = useState<"featured" | "content">("content");
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [qualityReport, setQualityReport] = useState<any>(null);
  
  // Data State
  const [form, setForm] = useState({
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    featuredImageUrl: "",
    featuredImageAlt: "",
    categoryId: null as number | null,
    status: "draft" as string,
    isFeatured: false,
    allowComments: true,
    noIndex: false,
    noFollow: false,
    ctaProductId: null as number | null,
    ctaCustomLabel: "",
    ctaCustomUrl: "",
    seoTitle: "",
    seoDescription: "",
    focusKeyword: "",
    tagIds: [] as number[],
    scheduledAt: "",
    secondaryKeywords: [] as string[]
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
      ImageExtension.configure({ inline: true }),
      TableExtension.configure({ resizable: true }),
      TableRowExtension,
      TableHeaderExtension,
      TableCellExtension,
      UnderlineExtension,
      PlaceholderExtension.configure({ placeholder: 'Write your post content here...' }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      setForm(f => ({ ...f, content: editor.getHTML() }));
    },
  });

  const loadQualityReport = async () => {
    if (postId === "new") return;
    try {
      const res = await fetch(`/api/admin/blog/posts/${postId}/seo-generator/quality-report`, { credentials: "include" });
      if (res.ok) setQualityReport(await res.json());
    } catch {
      // best-effort; publish gating just falls back to "no AI report on file"
    }
  };

  const loadPost = async () => {
    if (postId === "new") return;
    const res = await fetch(`/api/admin/blog/posts/${postId}`, { credentials: "include" });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    setForm(f => ({
      ...f,
      ...data,
      categoryId: data.categoryId || null,
      ctaProductId: data.ctaProductId || null,
      tagIds: data.tagIds || [],
      secondaryKeywords: data.secondaryKeywords || [],
      scheduledAt: data.scheduledAt ? new Date(data.scheduledAt).toISOString().slice(0, 16) : ""
    }));

    if (editor) editor.commands.setContent(data.content || "");
  };

  useEffect(() => {
    const init = async () => {
      try {
        const [catRes, tagRes] = await Promise.all([
          fetch("/api/admin/blog/categories", { credentials: "include" }),
          fetch("/api/admin/blog/tags", { credentials: "include" })
        ]);
        if (catRes.ok) setCategories(await catRes.json());
        if (tagRes.ok) setTags(await tagRes.json());

        if (postId !== "new") {
          await Promise.all([loadPost(), loadQualityReport()]);
        }
      } catch (err: any) {
        toast({ title: "Error loading editor", description: err.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    };
    if (editor) init();
  }, [postId, editor]);

  // Auto-generate slug from title if empty
  useEffect(() => {
    if (postId === "new" && form.title && !form.slug) {
      setForm(f => ({ ...f, slug: form.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') }));
    }
  }, [form.title]);

  const handleSave = async (forceStatus?: string) => {
    if (!form.title) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const url = postId === "new" ? "/api/admin/blog/posts" : `/api/admin/blog/posts/${postId}`;
      const method = postId === "new" ? "POST" : "PUT";
      
      const payload = {
        ...form,
        status: forceStatus || form.status,
        scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null
      };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await res.text());
      const saved = await res.json();
      
      toast({ title: "Post saved successfully" });
      
      if (postId === "new") {
        onBack(); // Return to list after create
      } else {
        setForm(f => ({ ...f, status: saved.status }));
      }
    } catch (err: any) {
      toast({ title: "Error saving post", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const insertMedia = (media: any) => {
    setMediaPickerOpen(false);
    if (mediaTarget === "featured") {
      setForm(f => ({ ...f, featuredImageUrl: media.url, featuredImageAlt: media.altText || "" }));
    } else if (editor) {
      editor.chain().focus().setImage({ src: media.url, alt: media.altText || "" }).run();
    }
  };

  const setLink = () => {
    const previousUrl = editor?.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);
    if (url === null) return;
    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  const wordCount = form.content ? form.content.replace(/<[^>]*>?/gm, '').split(/\s+/).filter(w => w.length > 0).length : 0;
  const readTime = Math.max(1, Math.ceil(wordCount / 200));

  // AI-generated posts with an unresolved quality report (flagged claims or
  // banned-phrase hits that haven't been explicitly acknowledged in the AI
  // Assistant panel) cannot be published until a human closes the loop there.
  const aiIssuesUnresolved = Boolean(
    qualityReport &&
    !qualityReport.reviewedAt &&
    ((qualityReport.bannedPhraseHits?.length ?? 0) > 0 || (qualityReport.flaggedClaims?.length ?? 0) > 0)
  );

  const handlePublishClick = () => {
    if (aiIssuesUnresolved) {
      toast({
        title: "AI content needs review before publishing",
        description: "This post has flagged claims or banned-phrase hits from the AI generator. Open the AI Assistant and mark the quality report reviewed first.",
        variant: "destructive",
      });
      setAiAssistantOpen(true);
      return;
    }
    handleSave("published");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 hover:text-primary px-2">
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
          </Button>
          <div className="h-6 w-px bg-gray-200"></div>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
            form.status === 'published' ? 'bg-green-100 text-green-700' :
            form.status === 'draft' ? 'bg-gray-100 text-gray-700' :
            form.status === 'in_review' ? 'bg-yellow-100 text-yellow-700' :
            form.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
            'bg-red-100 text-red-700'
          }`}>
            {form.status.replace("_", " ")}
          </span>
          {aiIssuesUnresolved && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800">
              <AlertTriangle className="w-3 h-3" /> AI review needed
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {form.status === "published" && postId !== "new" && (
            <a href={`/blog/${form.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center h-9 px-3 text-sm font-bold text-gray-600 hover:text-primary hover:bg-primary/10 rounded-md transition-colors">
              <Eye className="w-4 h-4 mr-1.5" /> View
            </a>
          )}

          {postId !== "new" && (
            <Button variant="outline" onClick={() => setAiAssistantOpen(true)} className="font-bold border-primary/30 text-primary hover:bg-primary/10">
              <Sparkles className="w-4 h-4 mr-1.5" /> AI Assistant
            </Button>
          )}

          <Button variant="outline" onClick={() => handleSave()} disabled={saving} className="font-bold">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
            Save
          </Button>

          {/* Role-based actions */}
          {staff.role === "author" ? (
            <Button onClick={() => handleSave("in_review")} disabled={saving || form.status === "in_review"} className="bg-primary text-white font-bold">
              <Send className="w-4 h-4 mr-1.5" /> Submit for Review
            </Button>
          ) : (
            <Button
              onClick={handlePublishClick}
              disabled={saving || form.status === "published"}
              title={aiIssuesUnresolved ? "This post has unresolved AI quality-report issues — review them in the AI Assistant first." : undefined}
              className={`font-bold text-white ${aiIssuesUnresolved ? "bg-amber-500 hover:bg-amber-600" : "bg-green-600 hover:bg-green-700"}`}
            >
              {aiIssuesUnresolved ? <AlertTriangle className="w-4 h-4 mr-1.5" /> : <Globe className="w-4 h-4 mr-1.5" />}
              Publish
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row max-w-[1400px] mx-auto">
          
          {/* Main Content Column */}
          <div className="flex-1 p-6 lg:border-r border-gray-200 lg:min-h-screen">
            <div className="max-w-3xl mx-auto space-y-6">
              
              <Input 
                value={form.title} 
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Post Title" 
                className="text-3xl font-heading font-bold h-auto py-3 border-transparent px-0 hover:border-gray-200 focus:border-primary shadow-none rounded-none border-b"
              />
              
              <div className="flex items-center text-sm text-gray-500 gap-2 px-1">
                <span>/blog/</span>
                <input 
                  type="text"
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') }))}
                  className="flex-1 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary focus:outline-none py-1 transition-colors"
                  placeholder="post-slug"
                />
              </div>

              {/* Toolbar */}
              <div className="sticky top-[73px] z-10 bg-white border border-gray-200 rounded-lg p-1.5 flex flex-wrap gap-1 shadow-sm">
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleBold().run()} className={editor?.isActive('bold') ? 'bg-gray-100' : ''}><Bold className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleItalic().run()} className={editor?.isActive('italic') ? 'bg-gray-100' : ''}><Italic className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleUnderline().run()} className={editor?.isActive('underline') ? 'bg-gray-100' : ''}><UnderlineIcon className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleStrike().run()} className={editor?.isActive('strike') ? 'bg-gray-100' : ''}><Strikethrough className="w-4 h-4" /></Button>
                <div className="w-px h-6 bg-gray-200 mx-1 self-center"></div>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={editor?.isActive('heading', { level: 2 }) ? 'bg-gray-100' : ''}><Heading2 className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} className={editor?.isActive('heading', { level: 3 }) ? 'bg-gray-100' : ''}><Heading3 className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleHeading({ level: 4 }).run()} className={editor?.isActive('heading', { level: 4 }) ? 'bg-gray-100' : ''}><Heading4 className="w-4 h-4" /></Button>
                <div className="w-px h-6 bg-gray-200 mx-1 self-center"></div>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleBulletList().run()} className={editor?.isActive('bulletList') ? 'bg-gray-100' : ''}><List className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={editor?.isActive('orderedList') ? 'bg-gray-100' : ''}><ListOrdered className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleBlockquote().run()} className={editor?.isActive('blockquote') ? 'bg-gray-100' : ''}><Quote className="w-4 h-4" /></Button>
                <div className="w-px h-6 bg-gray-200 mx-1 self-center"></div>
                <Button type="button" variant="ghost" size="icon" onClick={setLink} className={editor?.isActive('link') ? 'bg-gray-100' : ''}><Link2 className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().unsetLink().run()} disabled={!editor?.isActive('link')}><Link2Off className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => { setMediaTarget("content"); setMediaPickerOpen(true); }}><ImageIcon className="w-4 h-4 text-primary" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().toggleCodeBlock().run()} className={editor?.isActive('codeBlock') ? 'bg-gray-100' : ''}><Code className="w-4 h-4" /></Button>
                <div className="flex-1"></div>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().undo().run()} disabled={!editor?.can().undo()}><Undo className="w-4 h-4" /></Button>
                <Button type="button" variant="ghost" size="icon" onClick={() => editor?.chain().focus().redo().run()} disabled={!editor?.can().redo()}><Redo className="w-4 h-4" /></Button>
              </div>

              {/* Editor */}
              <div className="prose prose-slate max-w-none min-h-[500px]">
                <EditorContent editor={editor} />
              </div>
              
              <div className="text-xs text-gray-400 font-semibold text-right pt-4 border-t border-gray-100">
                {wordCount} words • ~{readTime} min read
              </div>
            </div>
          </div>

          {/* Sidebar Column */}
          <div className="w-full lg:w-80 bg-gray-50/50 p-6 space-y-8">
            
            {/* Excerpt */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Excerpt</label>
              <Textarea 
                value={form.excerpt} 
                onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
                placeholder="Short summary for blog index..." 
                className="resize-none h-24 bg-white"
              />
            </div>

            {/* Featured Image */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Featured Image</label>
              {form.featuredImageUrl ? (
                <div className="relative group rounded-lg overflow-hidden border border-gray-200 bg-white">
                  <img src={form.featuredImageUrl} alt="Featured" className="w-full h-auto object-cover" />
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setMediaTarget("featured"); setMediaPickerOpen(true); }}>Change</Button>
                    <Button size="sm" variant="destructive" onClick={() => setForm(f => ({ ...f, featuredImageUrl: "", featuredImageAlt: "" }))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <button 
                  onClick={() => { setMediaTarget("featured"); setMediaPickerOpen(true); }}
                  className="w-full py-8 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors font-bold text-sm flex flex-col items-center gap-2"
                >
                  <ImageIcon className="w-6 h-6" />
                  Select Image
                </button>
              )}
            </div>

            {/* Taxonomy */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Category</label>
                <select 
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.categoryId || ""}
                  onChange={e => setForm(f => ({ ...f, categoryId: e.target.value ? parseInt(e.target.value) : null }))}
                >
                  <option value="">No Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Tags</label>
                <div className="bg-white border border-gray-200 rounded-md p-2 max-h-40 overflow-y-auto flex flex-wrap gap-1.5">
                  {tags.map(t => {
                    const active = form.tagIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setForm(f => ({
                          ...f, 
                          tagIds: active ? f.tagIds.filter(id => id !== t.id) : [...f.tagIds, t.id]
                        }))}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${active ? "bg-primary text-white border-primary" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-primary/50"}`}
                      >
                        {t.name}
                      </button>
                    )
                  })}
                  {tags.length === 0 && <span className="text-xs text-gray-400 p-1">No tags available</span>}
                </div>
              </div>
            </div>

            {/* CTA Panel */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-gray-100 pb-2">Call to Action</h3>
              
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Product Recommendation</label>
                <select 
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  value={form.ctaProductId || ""}
                  onChange={e => setForm(f => ({ ...f, ctaProductId: e.target.value ? parseInt(e.target.value) : null, ctaCustomUrl: "", ctaCustomLabel: "" }))}
                >
                  <option value="">None</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              {!form.ctaProductId && (
                <>
                  <div className="text-xs text-center text-gray-400 font-semibold">— OR CUSTOM LINK —</div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Button Label</label>
                    <Input value={form.ctaCustomLabel} onChange={e => setForm(f => ({ ...f, ctaCustomLabel: e.target.value }))} placeholder="Learn More" className="h-9" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">URL</label>
                    <Input value={form.ctaCustomUrl} onChange={e => setForm(f => ({ ...f, ctaCustomUrl: e.target.value }))} placeholder="https://..." className="h-9" />
                  </div>
                </>
              )}
            </div>

            {/* SEO Panel */}
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-gray-100 pb-2">SEO</h3>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-gray-500">SEO Title</label>
                  <span className={`text-[10px] font-bold ${form.seoTitle.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{form.seoTitle.length}/60</span>
                </div>
                <Input value={form.seoTitle} onChange={e => setForm(f => ({ ...f, seoTitle: e.target.value }))} className="h-9" placeholder="Overrides post title in <title>" />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-semibold text-gray-500">SEO Description</label>
                  <span className={`text-[10px] font-bold ${form.seoDescription.length > 155 ? 'text-red-500' : 'text-gray-400'}`}>{form.seoDescription.length}/155</span>
                </div>
                <Textarea value={form.seoDescription} onChange={e => setForm(f => ({ ...f, seoDescription: e.target.value }))} className="resize-none h-20 text-sm" placeholder="Meta description..." />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Focus Keyword</label>
                <Input value={form.focusKeyword} onChange={e => setForm(f => ({ ...f, focusKeyword: e.target.value }))} className="h-9" />
              </div>

              <div className="pt-2 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">No Index</span>
                  <Switch checked={form.noIndex} onCheckedChange={(v) => setForm(f => ({ ...f, noIndex: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">No Follow</span>
                  <Switch checked={form.noFollow} onCheckedChange={(v) => setForm(f => ({ ...f, noFollow: v }))} />
                </div>
              </div>
            </div>

            {/* Settings (Admin/Editor) */}
            {staff.role !== "author" && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground border-b border-gray-100 pb-2">Settings</h3>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">Featured Post</span>
                  <Switch checked={form.isFeatured} onCheckedChange={(v) => setForm(f => ({ ...f, isFeatured: v }))} />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">Allow Comments</span>
                  <Switch checked={form.allowComments} onCheckedChange={(v) => setForm(f => ({ ...f, allowComments: v }))} />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Publish Date / Schedule</label>
                  <Input 
                    type="datetime-local" 
                    value={form.scheduledAt} 
                    onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} 
                    className="h-9 text-sm" 
                  />
                  {form.scheduledAt && <p className="text-[10px] text-muted-foreground mt-1">Set status to "scheduled" to publish automatically.</p>}
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      <Dialog open={mediaPickerOpen} onOpenChange={setMediaPickerOpen}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col p-0 overflow-hidden">
          <MediaLibrary staff={staff} mode="picker" onSelect={insertMedia} />
        </DialogContent>
      </Dialog>

      {postId !== "new" && (
        <Dialog open={aiAssistantOpen} onOpenChange={setAiAssistantOpen}>
          <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0 overflow-hidden">
            <AiAssistantPanel
              postId={postId}
              staff={staff}
              focusKeyword={form.focusKeyword}
              secondaryKeywords={form.secondaryKeywords}
              currentContentHtml={form.content}
              onGenerated={async () => { await loadPost(); await loadQualityReport(); }}
              onClose={() => { setAiAssistantOpen(false); loadQualityReport(); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
