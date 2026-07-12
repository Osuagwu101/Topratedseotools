import { useEffect, useState } from "react";
import { useUser } from "@clerk/react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Star, X } from "lucide-react";

interface Prompt {
  id: number;
  orderId: number | null;
  assignmentId: number | null;
  source: "purchase" | "assignment";
  productId: number;
  productName: string;
  promptCount: number;
}

const SESSION_SHOWN_KEY = "review_prompt_shown_session";

export function ReviewPrompt() {
  const { user, isSignedIn } = useUser();
  const { toast } = useToast();
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [active, setActive] = useState<Prompt | null>(null);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isSignedIn || !user) return;

    // Already shown in this browser session?
    const sessionShown = sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
    if (sessionShown) return;

    fetch(`${basePath}/api/users/me/review-prompts`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Prompt[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setPrompts(data);
          setActive(data[0]);
          // Mark this session as having shown a prompt
          sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
          // Increment the backend prompt count for this specific prompt
          fetch(`${basePath}/api/users/me/review-prompts/${data[0].id}/shown`, {
            method: "POST",
            credentials: "include",
          }).catch(() => {});
        }
      })
      .catch(() => {});
  }, [isSignedIn, user, basePath]);

  const close = () => {
    setActive(null);
    // Move to next prompt if any
    const remaining = prompts.filter((p) => p.id !== active?.id);
    if (remaining.length > 0) {
      setPrompts(remaining);
      setActive(remaining[0]);
      setRating(5);
      setTitle("");
      setText("");
    }
  };

  const submit = async () => {
    if (!active || !text.trim()) return;
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        productId: active.productId,
        rating,
        title: title.trim() || null,
        text: text.trim(),
      };
      if (active.source === "assignment" || active.assignmentId) {
        body.assignmentId = active.assignmentId;
      } else {
        body.orderId = active.orderId;
      }
      const res = await fetch(`${basePath}/api/reviews`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast({ title: "Review submitted", description: "Thank you for your feedback!" });
        close();
      } else {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Could not submit review", description: data.error || "Please try again.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Could not submit review", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const postpone = () => {
    close();
  };

  if (!active) return null;

  return (
    <Dialog open onOpenChange={() => postpone()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-heading uppercase">How was {active.productName}?</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {active.source === "assignment" || active.assignmentId
              ? `You have access to ${active.productName}. Share your experience to help others.`
              : `You recently purchased ${active.productName}. Share your experience to help others.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-center justify-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setRating(i + 1)}
                className="p-1 focus:outline-none"
                aria-label={`Rate ${i + 1} out of 5`}
              >
                <Star
                  className={`w-8 h-8 transition-colors ${i < rating ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`}
                />
              </button>
            ))}
          </div>

          <Input
            placeholder="Review title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="font-medium"
          />

          <Textarea
            placeholder="Tell us about your experience..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="font-medium resize-none"
          />

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={postpone} disabled={submitting}>
              Review later
            </Button>
            <Button onClick={submit} disabled={!text.trim() || submitting} className="bg-primary hover:bg-primary/90 text-white">
              {submitting ? "Submitting..." : "Submit Review"}
            </Button>
          </div>
        </div>

        <button
          onClick={postpone}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
          aria-label="Close review prompt"
        >
          <X className="w-4 h-4" />
        </button>
      </DialogContent>
    </Dialog>
  );
}
