import { useState, useEffect } from "react";
import { Loader2, FileText, Tags, Image as ImageIcon, MessageSquare, Users, Settings as SettingsIcon, Sparkles } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<"posts" | "taxonomy" | "media" | "comments" | "staff" | "settings" | "ai-generator">("posts");

  // Anyone who reached the admin dashboard (i.e. already holds a valid admin
  // token) is auto-signed-in to the Blog CMS as a full administrator -- no
  // separate Blog CMS login is required.
  const checkAuth = async () => {
    try {
      const res = await fetch("/api/blog/staff/me", {
        credentials: "include",
        headers: { Authorization: token },
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
        setAuthError(null);
      } else {
        setAuthError(
          res.status === 503
            ? "Admin credentials are not configured on the server (ADMIN_USERNAME / ADMIN_PASSWORD)."
            : "Could not load the Blog CMS. Please refresh the page.",
        );
      }
    } catch (err) {
      console.error(err);
      setAuthError("Could not load the Blog CMS. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (!staff) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
        <h2 className="text-xl font-heading font-bold mb-2">Blog CMS</h2>
        <p className="text-sm text-muted-foreground">{authError ?? "Could not load the Blog CMS."}</p>
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
