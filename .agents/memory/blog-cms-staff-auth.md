---
name: Blog CMS staff auth model (Top Rated SEO Tools / SubsHub store)
description: two-tier auth used for the blog CMS added to artifacts/store + artifacts/api-server — legacy admin bootstrap vs staff session
---

The blog CMS (`/api/blog/*`, `/api/admin/blog/*`) uses its own staff account system (`staffUsersTable`/`staffSessionsTable`, roles administrator/editor/author), separate from both the legacy site-owner Basic Auth (`ADMIN_USERNAME`/`ADMIN_PASSWORD`) and Clerk (customer auth).

**Why:** avoided introducing a new secret and avoided conflating customer auth (Clerk) with staff/editorial auth, while still preventing a lockout scenario where nobody can create the first blog administrator.

**How to apply:** the legacy Basic Auth token is only ever valid against `/api/admin/blog/staff` (list/create) and only while zero administrator accounts exist — this is the one-time bootstrap path. Once an administrator exists, that endpoint requires a staff session cookie (`credentials: "include"` from `/api/blog/staff/login`) and the legacy token no longer works there. All other `/api/admin/blog/*` CMS routes always require the staff session, never the legacy token. Don't reintroduce the legacy token as a general auth path for blog CMS routes.
