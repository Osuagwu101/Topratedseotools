---
name: SubsHub AI generator monthly cap alerting
description: How admins are warned about the SEO generator's site-wide monthly AI usage cap, and why it's a banner not an email.
---

No email-sending service (SendGrid/Resend/SMTP/etc.) is configured anywhere in this project. When asked to "email admins" about the monthly AI generation cap, it was implemented as a persistent in-app banner instead (shown to `role: "administrator"` staff on every admin blog page, not just the AI Generator settings tab).

**Why:** Setting up real email delivery requires connecting a new integration (Resend/SendGrid/etc.), which needs explicit user authorization. The task's acceptance criteria explicitly allowed "email or in-app banner," so the banner was the pragmatic, immediately-working choice. A follow-up task tracks adding real email once a provider is connected.

**How to apply:** The threshold is `seoGeneratorSettingsTable.warningThresholdPercent` (admin-configurable, default 80). Status is computed live (no "already notified" dedupe table) via `getMonthlyUsageStatus()` in `artifacts/api-server/src/lib/seoGenerator/usageLimits.ts`, exposed at `GET /admin/blog/seo-generator/usage-alert`. If you add real email sending, you'll need to add per-month/threshold dedupe so admins aren't emailed on every poll.
