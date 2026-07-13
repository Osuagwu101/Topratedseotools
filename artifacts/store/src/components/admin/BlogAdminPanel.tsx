import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogOut, FileText, Tags, Image as ImageIcon, MessageSquare, Users, Settings as SettingsIcon, Sparkles } from "lucide-react";
import PostsPanel from "./blog/PostsPanel";
import TaxonomyPanel from "./blog/TaxonomyPanel";
import MediaLibrary from "./blog/MediaLibrary";
import CommentsPanel from "./blog/CommentsPanel";
import StaffPanel from "./blog/StaffPanel";
import SettingsPanel from "./blog/SettingsPanel";
import SeoGeneratorSettingsPanel from "./blog/seo-generator/SeoGeneratorSettingsPanel";
import MonthlyUsageBanner from "./blog/seo-generator/MonthlyUsageBanner";

interface BlogAdminPanelProps {
  token: string;
  products: { id: number; name: string; description: string | null }[];
}

export interface StaffUser {
  id: number;
  email: string;
  name: string;
  role: "administrator" | "editor" | "author";
  authorSlug: string | null;
  bio: string | null;
  avatarUrl: string | null;
  active: boolean;
}

export default function BlogAdminPanel({ token, products }: BlogAdminPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  
  const [bootstrapNeeded, setBootstrapNeeded] = useState(false);
  const [bootstrapForm, setBootstrapForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [bootstrapping, setBootstrapping] = useState(false);
  
  const [activeTab, setActiveTab] = useState<"posts" | "taxonomy" | "media" | "comments" | "staff" | "settings" | "ai-generator">("posts");

  const checkAuth = async () => {
    try {
      const res = await fetch("/api/blog/staff/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
      } else if (res.status === 401) {
        // Not signed in as staff, check if we need to bootstrap
        const checkRes = await fetch("/api/admin/blog/staff", {
          headers: { Authorization: token },
        });
        if (checkRes.ok) {
          const list = await checkRes.json();
          if (Array.isArray(list) && list.length === 0) {
            setBootstrapNeeded(true);
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bootstrapForm.password !== bootstrapForm.confirm) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (bootstrapForm.password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    
    setBootstrapping(true);
    try {
      const res = await fetch("/api/admin/blog/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({
          email: bootstrapForm.email,
          password: bootstrapForm.password,
          name: bootstrapForm.name,
          role: "administrator"
        })
      });
      if (!res.ok) throw new Error(await res.text() || "Failed to create administrator");
      
      toast({ title: "Administrator created", description: "You can now sign in to the Blog CMS." });
      setBootstrapNeeded(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBootstrapping(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await fetch("/api/blog/staff/logout", { method: "POST", credentials: "include" });
      setStaff(null);
      checkAuth();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!staff) {
    if (bootstrapNeeded) {
      return (
        <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <h2 className="text-xl font-heading font-bold mb-2">Initialize Blog CMS</h2>
          <p className="text-sm text-muted-foreground mb-6">Create your first Administrator account to get started.</p>
          <form onSubmit={handleBootstrap} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Name</label>
              <Input required value={bootstrapForm.name} onChange={(e) => setBootstrapForm(f => ({ ...f, name: e.target.value }))} placeholder="John Doe" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Email</label>
              <Input required type="email" value={bootstrapForm.email} onChange={(e) => setBootstrapForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@example.com" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Password</label>
              <Input required type="password" value={bootstrapForm.password} onChange={(e) => setBootstrapForm(f => ({ ...f, password: e.target.value }))} placeholder="Min 8 chars" minLength={8} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Confirm Password</label>
              <Input required type="password" value={bootstrapForm.confirm} onChange={(e) => setBootstrapForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Min 8 chars" />
            </div>
            <Button type="submit" className="w-full font-bold" disabled={bootstrapping}>
              {bootstrapping ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Administrator
            </Button>
          </form>
        </div>
      );
    }

    return (
      <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <h2 className="text-xl font-heading font-bold mb-2">Blog CMS</h2>
        <p className="text-sm text-muted-foreground mb-6">Please sign in to manage the blog content.</p>
        <Link href="/admin/blog-staff-login">
          <Button className="font-bold">Sign In to Blog CMS</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar / Sub-nav */}
      <div className="w-full md:w-64 shrink-0 space-y-1">
        <div className="mb-6 px-3">
          <p className="text-sm font-bold text-foreground">{staff.name}</p>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{staff.role}</p>
        </div>
        
        <button
          onClick={() => setActiveTab("posts")}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "posts" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
        >
          <FileText className="w-4 h-4" /> Posts
        </button>
        
        {staff.role !== "author" && (
          <button
            onClick={() => setActiveTab("taxonomy")}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "taxonomy" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Tags className="w-4 h-4" /> Categories & Tags
          </button>
        )}
        
        <button
          onClick={() => setActiveTab("media")}
          className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "media" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
        >
          <ImageIcon className="w-4 h-4" /> Media Library
        </button>
        
        {staff.role !== "author" && (
          <button
            onClick={() => setActiveTab("comments")}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "comments" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <MessageSquare className="w-4 h-4" /> Comments
          </button>
        )}
        
        {staff.role === "administrator" && (
          <button
            onClick={() => setActiveTab("staff")}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "staff" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Users className="w-4 h-4" /> Staff
          </button>
        )}
        
        {staff.role === "administrator" && (
          <button
            onClick={() => setActiveTab("settings")}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "settings" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <SettingsIcon className="w-4 h-4" /> Settings & Redirects
          </button>
        )}

        {staff.role === "administrator" && (
          <button
            onClick={() => setActiveTab("ai-generator")}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "ai-generator" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Sparkles className="w-4 h-4" /> AI Generator
          </button>
        )}
        
        <div className="pt-6 mt-6 border-t border-gray-200 px-3">
          <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {staff.role === "administrator" && <MonthlyUsageBanner onOpenSettings={() => setActiveTab("ai-generator")} />}
        <div className="bg-white border border-gray-200 rounded-xl min-h-[600px]">
        {activeTab === "posts" && <PostsPanel staff={staff} products={products} />}
        {activeTab === "taxonomy" && staff.role !== "author" && <TaxonomyPanel staff={staff} />}
        {activeTab === "media" && <MediaLibrary staff={staff} onSelect={() => {}} mode="manage" />}
        {activeTab === "comments" && staff.role !== "author" && <CommentsPanel staff={staff} />}
        {activeTab === "staff" && staff.role === "administrator" && <StaffPanel staff={staff} />}
        {activeTab === "settings" && staff.role === "administrator" && <SettingsPanel staff={staff} />}
        {activeTab === "ai-generator" && staff.role === "administrator" && <SeoGeneratorSettingsPanel staff={staff} />}
        </div>
      </div>
    </div>
  );
}
