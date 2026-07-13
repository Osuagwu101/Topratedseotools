import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { StaffUser } from "../../BlogAdminPanel";
import {
  Loader2, Sparkles, Search, FileText, Wand2, History, RotateCcw,
  CheckCircle2, XCircle, AlertTriangle, Highlighter, X, ShieldCheck
} from "lucide-react";

interface ResearchItem {
  id: number;
  kind: string;
  value: string;
  included: boolean;
  extra?: { wordCount?: number; title?: string } | null;
}

interface Brief {
  id: number;
  searchIntent: string;
  targetWordCount: number;
  headingOutline: { level: number; text: string }[];
  faqCandidates: { question: string }[];
  featuredSnippetTarget: string;
  notes: string;
}

const KIND_LABELS: Record<string, string> = {
  autocomplete: "Autocomplete suggestions",
  related_keyword: "Related keywords",
  paa: "People also ask",
  related_search: "Related searches",
  competitor: "Top-ranking competitors",
};

const SECTION_LABELS: Record<string, string> = {
  featured_snippet: "Featured snippet answer",
  intro: "Introduction",
  body: "Body / main sections",
  faq: "FAQ",
  conclusion: "Conclusion",
};

export default function AiAssistantPanel({
  postId,
  staff,
  focusKeyword,
  secondaryKeywords,
  currentContentHtml,
  onGenerated,
  onClose,
}: {
  postId: number;
  staff: StaffUser;
  focusKeyword: string;
  secondaryKeywords: string[];
  currentContentHtml: string;
  onGenerated: () => Promise<void> | void;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState(focusKeyword || "");
  const [researching, setResearching] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [items, setItems] = useState<ResearchItem[]>([]);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [report, setReport] = useState<any>(null);
  const [confirmNeeded, setConfirmNeeded] = useState<{ kind: "generate" | "section"; sectionKey?: string } | null>(null);
  const [usage, setUsage] = useState<{ todayCount: number; monthCount: number; perUserDailyLimit: number; monthlyGenerationLimit: number } | null>(null);
  const [highlightPreview, setHighlightPreview] = useState(false);
  const [versionHistory, setVersionHistory] = useState<{ sectionKey: string; versions: any[] } | null>(null);
  const [sectionInstructions, setSectionInstructions] = useState<Record<string, string>>({});
  const [provider, setProvider] = useState<"openai" | "gemini">("openai");
  const [providerAvailability, setProviderAvailability] = useState({ hasOpenAiKey: true, hasGeminiKey: true });
  const [acknowledgeIssues, setAcknowledgeIssues] = useState(false);
  const [markingReviewed, setMarkingReviewed] = useState(false);

  const base = "/api/admin/blog/posts";

  const loadExisting = async () => {
    try {
      const [researchRes, usageRes, reportRes, settingsRes] = await Promise.all([
        fetch(`${base}/${postId}/seo-generator/research`, { credentials: "include" }),
        fetch(`/api/admin/blog/seo-generator/usage`, { credentials: "include" }),
        fetch(`${base}/${postId}/seo-generator/quality-report`, { credentials: "include" }),
        fetch(`/api/admin/blog/seo-generator/settings`, { credentials: "include" }),
      ]);
      if (researchRes.ok) {
        const data = await researchRes.json();
        setSession(data.session);
        setItems(data.items || []);
        setBrief(data.brief);
        if (data.session?.primaryKeyword) setKeyword(data.session.primaryKeyword);
      }
      if (usageRes.ok) setUsage(await usageRes.json());
      if (reportRes.ok) setReport(await reportRes.json());
      if (settingsRes.ok) {
        const s = await settingsRes.json();
        setProviderAvailability({ hasOpenAiKey: Boolean(s.hasOpenAiKey), hasGeminiKey: Boolean(s.hasGeminiKey) });
        setProvider(s.aiProvider === "gemini" ? "gemini" : "openai");
      }
    } catch (err: any) {
      toast({ title: "Error loading AI assistant data", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadExisting(); }, []);

  const refreshReport = async () => {
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/quality-report`, { credentials: "include" });
      if (res.ok) {
        setReport(await res.json());
        setAcknowledgeIssues(false);
      }
    } catch {
      // best-effort refresh
    }
  };

  const runResearch = async () => {
    if (!keyword.trim()) {
      toast({ title: "Enter a primary keyword first", variant: "destructive" });
      return;
    }
    setResearching(true);
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/research`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ primaryKeyword: keyword.trim(), provider }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setSession(data.session);
      setItems(data.items);
      setBrief(null);
      toast({ title: "Keyword research complete" });
    } catch (err: any) {
      toast({ title: "Keyword research failed", description: err.message, variant: "destructive" });
    } finally {
      setResearching(false);
    }
  };

  const toggleItem = async (item: ResearchItem) => {
    const next = { ...item, included: !item.included };
    setItems((prev) => prev.map((i) => (i.id === item.id ? next : i)));
    try {
      await fetch(`/api/admin/blog/seo-generator/research-items/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ included: next.included }),
      });
    } catch {
      // best-effort; UI already optimistically updated
    }
  };

  const runBrief = async () => {
    if (!session) return;
    setBriefing(true);
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/brief`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sessionId: session.id, provider }),
      });
      if (!res.ok) throw new Error(await res.text());
      setBrief(await res.json());
      toast({ title: "Content brief ready" });
    } catch (err: any) {
      toast({ title: "Content brief generation failed", description: err.message, variant: "destructive" });
    } finally {
      setBriefing(false);
    }
  };

  const runGenerate = async (confirm = false) => {
    setGenerating(true);
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ confirm, provider }),
      });
      if (res.status === 409) {
        setConfirmNeeded({ kind: "generate" });
        return;
      }
      if (res.status === 429) {
        const data = await res.json();
        toast({ title: "Limit reached", description: data.error, variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setReport(data.report);
      setAcknowledgeIssues(false);
      setConfirmNeeded(null);
      await onGenerated();
      toast({ title: "Article generated as draft", description: "Saved to this post. Review before publishing." });
    } catch (err: any) {
      toast({ title: "Article generation failed", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const runRegenerateSection = async (sectionKey: string, confirm = false) => {
    setRegeneratingSection(sectionKey);
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/regenerate-section`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ sectionKey, confirm, provider, instructions: sectionInstructions[sectionKey] || undefined }),
      });
      if (res.status === 409) {
        setConfirmNeeded({ kind: "section", sectionKey });
        return;
      }
      if (res.status === 429) {
        const data = await res.json();
        toast({ title: "Limit reached", description: data.error, variant: "destructive" });
        return;
      }
      if (!res.ok) throw new Error(await res.text());
      setConfirmNeeded(null);
      await onGenerated();
      await refreshReport();
      toast({ title: `${SECTION_LABELS[sectionKey] || sectionKey} regenerated`, description: "Quality report sign-off was cleared — review it again before publishing." });
    } catch (err: any) {
      toast({ title: "Section regeneration failed", description: err.message, variant: "destructive" });
    } finally {
      setRegeneratingSection(null);
    }
  };

  const loadVersionHistory = async (sectionKey: string) => {
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/versions?sectionKey=${sectionKey}`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      setVersionHistory({ sectionKey, versions: await res.json() });
    } catch (err: any) {
      toast({ title: "Could not load version history", description: err.message, variant: "destructive" });
    }
  };

  const restoreVersion = async (versionId: number) => {
    if (!versionHistory) return;
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/versions/${versionId}/restore`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      await onGenerated();
      await loadVersionHistory(versionHistory.sectionKey);
      await refreshReport();
      toast({ title: "Version restored", description: "Quality report sign-off was cleared — review it again before publishing." });
    } catch (err: any) {
      toast({ title: "Restore failed", description: err.message, variant: "destructive" });
    }
  };

  const markReviewed = async () => {
    if (!report) return;
    setMarkingReviewed(true);
    try {
      const res = await fetch(`${base}/${postId}/seo-generator/quality-report/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ acknowledgeIssues }),
      });
      if (!res.ok) throw new Error(await res.text());
      setReport(await res.json());
      toast({ title: "Marked reviewed & ready to publish" });
    } catch (err: any) {
      toast({ title: "Could not mark reviewed", description: err.message, variant: "destructive" });
    } finally {
      setMarkingReviewed(false);
    }
  };

  const hasIssues = Boolean(report && ((report.bannedPhraseHits?.length ?? 0) > 0 || (report.flaggedClaims?.length ?? 0) > 0));
  const isReviewed = Boolean(report?.reviewedAt);

  const highlightedHtml = useMemo(() => {
    if (!highlightPreview) return currentContentHtml;
    const terms = [focusKeyword, ...secondaryKeywords].filter((t) => t && t.trim().length > 1);
    if (terms.length === 0) return currentContentHtml;
    let html = currentContentHtml;
    const sorted = [...terms].sort((a, b) => b.length - a.length);
    for (const term of sorted) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(${escaped})(?![^<]*>)`, "gi");
      html = html.replace(re, '<mark style="background:#FEF08A;padding:0 2px;">$1</mark>');
    }
    return html;
  }, [highlightPreview, currentContentHtml, focusKeyword, secondaryKeywords]);

  const itemsByKind = useMemo(() => {
    const grouped: Record<string, ResearchItem[]> = {};
    for (const item of items) {
      grouped[item.kind] = grouped[item.kind] || [];
      grouped[item.kind].push(item);
    }
    return grouped;
  }, [items]);

  if (loading) {
    return <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="flex flex-col h-full max-h-[85vh]">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-bold">AI SEO Article Assistant</h2>
        </div>
        <div className="flex items-center gap-3">
          {usage && (
            <span className="text-xs text-gray-500 font-semibold">
              {usage.todayCount}/{usage.perUserDailyLimit} today &middot; {usage.monthCount}/{usage.monthlyGenerationLimit} this month
            </span>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}><X className="w-4 h-4" /></Button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-100 bg-gray-50 shrink-0">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">AI Provider</span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setProvider("openai")}
            disabled={!providerAvailability.hasOpenAiKey}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${provider === "openai" ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200"} disabled:opacity-40 disabled:cursor-not-allowed`}
            title={providerAvailability.hasOpenAiKey ? undefined : "OPENAI_API_KEY is not configured"}
          >
            OpenAI
          </button>
          <button
            type="button"
            onClick={() => setProvider("gemini")}
            disabled={!providerAvailability.hasGeminiKey}
            className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${provider === "gemini" ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200"} disabled:opacity-40 disabled:cursor-not-allowed`}
            title={providerAvailability.hasGeminiKey ? undefined : "GEMINI_API_KEY is not configured"}
          >
            Gemini
          </button>
        </div>
        <span className="text-xs text-gray-400">
          Every research/brief/generate action below uses this provider — switch here if you run out of credit on the other one.
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-8">
        {/* Step 1: Keyword research */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Search className="w-4 h-4 text-primary" /> 1. Keyword Research</div>
          <div className="flex gap-2">
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Primary keyword, e.g. best VPN for streaming" className="h-9" />
            <Button onClick={runResearch} disabled={researching} className="font-bold shrink-0">
              {researching ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Search className="w-4 h-4 mr-1.5" />}
              Research
            </Button>
          </div>
          {session && (
            <p className="text-xs text-gray-500">
              {session.serpDataAvailable
                ? "SERP data (PAA, related searches, competitors) included."
                : "Free autocomplete + AI-suggested keywords only — configure a SERP provider in AI Settings for PAA and competitor analysis."}
            </p>
          )}
          {Object.keys(itemsByKind).length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              {Object.entries(itemsByKind).map(([kind, kindItems]) => (
                <div key={kind} className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{KIND_LABELS[kind] || kind}</div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {kindItems.map((item) => (
                      <label key={item.id} className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                        <input type="checkbox" checked={item.included} onChange={() => toggleItem(item)} className="mt-0.5" />
                        <span className={item.included ? "" : "line-through text-gray-400"}>
                          {item.value}
                          {item.extra?.wordCount ? ` (${item.extra.wordCount} words)` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Step 2: Content brief */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground"><FileText className="w-4 h-4 text-primary" /> 2. Content Brief</div>
          <Button onClick={runBrief} disabled={!session || briefing} variant="outline" className="font-bold">
            {briefing ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <FileText className="w-4 h-4 mr-1.5" />}
            {brief ? "Regenerate Brief" : "Generate Brief"}
          </Button>
          {brief && (
            <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 text-sm space-y-2">
              <div><span className="font-bold">Intent:</span> {brief.searchIntent}</div>
              <div><span className="font-bold">Target length:</span> ~{brief.targetWordCount} words</div>
              <div><span className="font-bold">Featured snippet target:</span> {brief.featuredSnippetTarget}</div>
              <div>
                <span className="font-bold">Outline:</span>
                <ul className="list-disc pl-5 mt-1">
                  {brief.headingOutline?.map((h, i) => <li key={i} className={h.level === 3 ? "ml-4" : ""}>{h.text}</li>)}
                </ul>
              </div>
              <div>
                <span className="font-bold">FAQ candidates:</span>
                <ul className="list-disc pl-5 mt-1">
                  {brief.faqCandidates?.map((f, i) => <li key={i}>{f.question}</li>)}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* Step 3: Generation */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Wand2 className="w-4 h-4 text-primary" /> 3. Generate Article</div>
          <Button onClick={() => runGenerate(false)} disabled={!brief || generating} className="font-bold bg-primary text-white">
            {generating ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Wand2 className="w-4 h-4 mr-1.5" />}
            Generate Full Draft
          </Button>
          <p className="text-xs text-gray-500">Always saves as a draft — never auto-published. Review the content and quality report below before publishing.</p>

          {confirmNeeded?.kind === "generate" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <span className="text-xs text-amber-800">This will call the AI model and count against your daily limit. Continue?</span>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setConfirmNeeded(null)}>Cancel</Button>
                <Button size="sm" onClick={() => runGenerate(true)} className="font-bold">Confirm</Button>
              </div>
            </div>
          )}

          {report && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-gray-500">Quality Report</div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-1.5">{report.keywordPlacementScore >= 70 ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />} Keyword placement: {report.keywordPlacementScore}/100</div>
                <div className="flex items-center gap-1.5">{report.lengthCheckPassed ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-500" />} Length rules {report.lengthCheckPassed ? "passed" : "need attention"}</div>
                <div>Intro: {report.introWordCount} words (target 90-110)</div>
                <div>Conclusion: {report.conclusionWordCount} words (target 90-110)</div>
                <div>Featured snippet: {report.featuredSnippetLength} chars (target 150-300)</div>
                <div>Readability score: {report.readabilityScore}/100</div>
              </div>
              {report.bannedPhraseHits?.length > 0 && (
                <div className="text-xs text-red-600 flex items-start gap-1.5"><XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> Banned phrases found: {report.bannedPhraseHits.join(", ")}</div>
              )}
              {report.flaggedClaims?.length > 0 && (
                <div className="text-xs text-amber-700">
                  <div className="flex items-center gap-1.5 font-bold mb-1"><AlertTriangle className="w-3.5 h-3.5" /> Claims to fact-check:</div>
                  <ul className="list-disc pl-5">{report.flaggedClaims.map((c: string, i: number) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}

              {/* Ready-to-publish checklist */}
              <div className="border-t border-gray-100 pt-3 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">
                  <ShieldCheck className="w-3.5 h-3.5" /> Ready to Publish Checklist
                </div>
                {isReviewed ? (
                  <div className="flex items-center gap-1.5 text-sm text-green-700 font-semibold bg-green-50 border border-green-200 rounded-md px-3 py-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Reviewed{report.reviewedAt ? ` on ${new Date(report.reviewedAt).toLocaleString()}` : ""} — this post is ready to publish.
                  </div>
                ) : (
                  <>
                    {hasIssues && (
                      <label className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={acknowledgeIssues}
                          onChange={(e) => setAcknowledgeIssues(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span>I have reviewed the flagged claims and/or banned-phrase hits above and confirm this content is safe to publish.</span>
                      </label>
                    )}
                    <Button
                      size="sm"
                      onClick={markReviewed}
                      disabled={markingReviewed || (hasIssues && !acknowledgeIssues)}
                      className="font-bold bg-green-600 hover:bg-green-700 text-white"
                    >
                      {markingReviewed ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                      Mark reviewed & ready to publish
                    </Button>
                    {hasIssues && !acknowledgeIssues && (
                      <p className="text-[11px] text-gray-400">Acknowledge the flagged issues above to enable this.</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Step 4: Section regeneration */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-bold text-foreground"><RotateCcw className="w-4 h-4 text-primary" /> 4. Regenerate a Section</div>
          <div className="space-y-2">
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <div key={key} className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-lg p-2">
                <span className="text-sm font-semibold w-40 shrink-0">{label}</span>
                <Input
                  value={sectionInstructions[key] || ""}
                  onChange={(e) => setSectionInstructions((s) => ({ ...s, [key]: e.target.value }))}
                  placeholder="Optional instructions..."
                  className="h-8 text-xs flex-1"
                />
                <Button size="sm" variant="outline" onClick={() => runRegenerateSection(key)} disabled={regeneratingSection === key} className="shrink-0 font-bold">
                  {regeneratingSection === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Regenerate"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => loadVersionHistory(key)} className="shrink-0"><History className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </div>
          {confirmNeeded?.kind === "section" && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3">
              <span className="text-xs text-amber-800">Regenerating "{SECTION_LABELS[confirmNeeded.sectionKey!]}" calls the AI model and counts against your daily limit. Continue?</span>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="ghost" onClick={() => setConfirmNeeded(null)}>Cancel</Button>
                <Button size="sm" onClick={() => runRegenerateSection(confirmNeeded.sectionKey!, true)} className="font-bold">Confirm</Button>
              </div>
            </div>
          )}

          {versionHistory && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Version history — {SECTION_LABELS[versionHistory.sectionKey]}</span>
                <Button size="sm" variant="ghost" onClick={() => setVersionHistory(null)}><X className="w-3.5 h-3.5" /></Button>
              </div>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {versionHistory.versions.map((v: any) => (
                  <div key={v.id} className="flex items-center justify-between text-xs border border-gray-100 rounded p-2">
                    <span>v{v.versionNumber} {v.isActive && <span className="text-green-600 font-bold">(active)</span>} &middot; {new Date(v.createdAt).toLocaleString()}</span>
                    {!v.isActive && <Button size="sm" variant="outline" onClick={() => restoreVersion(v.id)} className="h-6 text-[10px]">Restore</Button>}
                  </div>
                ))}
                {versionHistory.versions.length === 0 && <p className="text-xs text-gray-400">No versions yet.</p>}
              </div>
            </div>
          )}
        </section>

        {/* Step 5: Keyword highlighting (admin-only preview, never persisted) */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground"><Highlighter className="w-4 h-4 text-primary" /> 5. Keyword Highlight Preview</div>
            <Button size="sm" variant={highlightPreview ? "default" : "outline"} onClick={() => setHighlightPreview((v) => !v)} className="font-bold">
              {highlightPreview ? "Hide" : "Show"} Highlights
            </Button>
          </div>
          <p className="text-xs text-gray-500">Staff-only preview — highlights are never saved to the post or shown to readers.</p>
          {highlightPreview && (
            <div className="prose prose-sm max-w-none bg-white border border-gray-200 rounded-lg p-4 max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: highlightedHtml || "<p class='text-gray-400'>No content yet.</p>" }} />
          )}
        </section>
      </div>
    </div>
  );
}
