import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut, FileText, Tags, Image as ImageIcon, MessageSquare, Users, Settings as SettingsIcon, Sparkles } from "lucide-react";
import PostsPanel from "./blog/PostsPanel";
import TaxonomyPanel from "./blog/TaxonomyPanel";
import MediaLibrary from "./blog/MediaLibrary";
import CommentsPanel from "./blog/CommentsPanel";
import StaffPanel from "./blog/StaffPanel";
import SettingsPanel from "./blog/SettingsPanel";
import SeoGeneratorSettingsPanel from "./blog/seo-generator/SeoGeneratorSettingsPanel";
import MonthlyUsageBanner from "./blog/seo-generator/MonthlyUsageBanner";

export type BlogAdminTab = "posts" | "taxonomy" | "media" | "comments" | "staff" | "settings" | "ai-generator";

interface BlogAdminPanelProps {
  // Present when embedded in the main /admin dashboard (legacy admin
  // basic-auth token) -- auto-signs in as the site-owner administrator.
  // Absent when embedded in the standalone /admin/blog-cms page, where the
  // user must already hold their own staff session cookie instead.
  token?: string;
  products: { id: number; name: string; description: string | null }[];
  // Optional controlled active tab -- lets a parent (e.g. the admin
  // dashboard's collapsing sidebar) drive which sub-page is shown. Falls
  // back to internal state when embedded standalone.
  activeTab?: BlogAdminTab;
  onActiveTabChange?: (tab: BlogAdminTab) => void;
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

export default function BlogAdminPanel({ token, products, activeTab: controlledTab, onActiveTabChange }: BlogAdminPanelProps) {
  const [, setLocation] = useLocation();
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [internalTab, setInternalTab] = useState<BlogAdminTab>("posts");
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = (tab: BlogAdminTab) => {
    if (onActiveTabChange) onActiveTabChange(tab);
    else setInternalTab(tab);
  };
  // When set, PostsPanel opens a fresh "New Post" straight into the AI
  // Assistant, so the "New AI Article" shortcut on the AI Generator tab can
  // jump the user directly into keyword research without a detour through
  // an empty Posts list.
  const [startNewAiArticle, setStartNewAiArticle] = useState(false);
  // When set, PostsPanel opens this existing post directly in the editor --
  // used by the "Fix in editor" / "Add in editor" links on the AI
  // Generator's Link Insights panel.
  const [openPostId, setOpenPostId] = useState<number | null>(null);

  // Two ways to reach this component:
  //  - Embedded in /admin (token set): anyone already holding a valid admin
  //    token is auto-signed-in to the Blog CMS as a full administrator -- no
  //    separate Blog CMS login is required.
  //  - Standalone at /admin/blog-cms (no token): the user must already hold
  //    their own staff session cookie from /admin/blog-staff-login; if not,
  //    send them there instead of showing a dead end.
  const checkAuth = async () => {
    try {
      const res = await fetch("/api/blog/staff/me", {
        credentials: "include",
        ...(token ? { headers: { Authorization: token } } : {}),
      });
      if (res.ok) {
        const data = await res.json();
        setStaff(data);
        setAuthError(null);
      } else if (!token) {
        setLocation("/admin/blog-staff-login");
      } else {
        setAuthError(
          res.status === 503
            ? "Admin credentials are not configured on the server (ADMIN_USERNAME / ADMIN_PASSWORD)."
            : "Could not load the Blog CMS. Please refresh the page.",
        );
      }
    } catch (err) {
      console.error(err);
      if (!token) {
        setLocation("/admin/blog-staff-login");
      } else {
        setAuthError("Could not load the Blog CMS. Please refresh the page.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch("/api/blog/staff/logout", { method: "POST", credentials: "include" });
    } catch (err) {
      console.error(err);
    } finally {
      setLocation("/admin/blog-staff-login");
    }
  };

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

        {staff.role !== "author" && (
          <button
            onClick={() => setActiveTab("ai-generator")}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${activeTab === "ai-generator" ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
          >
            <Sparkles className="w-4 h-4" /> AI Generator
          </button>
        )}

        {!token && (
          <div className="pt-6 mt-6 border-t border-gray-200 px-3">
            <Button variant="ghost" size="sm" onClick={handleSignOut} className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50">
              <LogOut className="w-4 h-4 mr-2" /> Sign out
            </Button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        {staff.role === "administrator" && <MonthlyUsageBanner onOpenSettings={() => setActiveTab("ai-generator")} />}
        <div className="bg-white border border-gray-200 rounded-xl min-h-[600px]">
        {activeTab === "posts" && (
          <PostsPanel
            staff={staff}
            products={products}
            autoStartAiArticle={startNewAiArticle}
            onAutoStartHandled={() => setStartNewAiArticle(false)}
            openPostId={openPostId}
            onOpenPostHandled={() => setOpenPostId(null)}
          />
        )}
        {activeTab === "taxonomy" && staff.role !== "author" && <TaxonomyPanel staff={staff} />}
        {activeTab === "media" && <MediaLibrary staff={staff} onSelect={() => {}} mode="manage" />}
        {activeTab === "comments" && staff.role !== "author" && <CommentsPanel staff={staff} />}
        {activeTab === "staff" && staff.role === "administrator" && <StaffPanel staff={staff} />}
        {activeTab === "settings" && staff.role === "administrator" && <SettingsPanel staff={staff} />}
        {activeTab === "ai-generator" && staff.role !== "author" && (
          <SeoGeneratorSettingsPanel
            staff={staff}
            onStartNewArticle={() => {
              setStartNewAiArticle(true);
              setActiveTab("posts");
            }}
            onOpenPost={(postId) => {
              setOpenPostId(postId);
              setActiveTab("posts");
            }}
          />
        )}
        </div>
      </div>
    </div>
  );
}
