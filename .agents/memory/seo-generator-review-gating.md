---
name: SEO generator quality-report review gating
description: How AI-generated blog article review sign-off is tracked and used to gate publishing.
---

`seo_quality_reports` rows carry `reviewedAt`/`reviewedBy`/`issuesAcknowledged`. A report counts as
"resolved" once `reviewedAt` is set; if it has `bannedPhraseHits`/`flaggedClaims`, the reviewer must
pass `acknowledgeIssues: true` to `POST .../quality-report/review` or the API rejects it.

**Why:** publishing must not silently skip a human check of flagged AI claims/banned phrases — the
whole point of the AI Assistant panel's "ready to publish" checklist.

**How to apply:** any endpoint that changes an AI-generated post's live content after a report was
reviewed (section regenerate, version restore, presumably future ones) must reset
`reviewedAt/reviewedBy/issuesAcknowledged` to null/false on that post's latest report, or a stale
sign-off will incorrectly let a re-edited post publish unreviewed.

The gate must be enforced server-side, not just in one UI button — every path that can flip a post's
status to "published" (or "scheduled", since that becomes an unattended future publish) needs to call
the same backend guard. A client-only check is trivially bypassed via bulk actions or a second UI
entry point. Route handlers that skip AI-owned content entirely (no quality report row) are
unaffected — the gate is a no-op for posts that were never AI-generated.
