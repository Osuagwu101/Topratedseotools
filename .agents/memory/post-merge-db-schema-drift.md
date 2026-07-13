---
name: Post-merge DB schema drift
description: Task-agent merges that add lib/db schema columns can leave the compiled dist/*.d.ts stale, breaking consumer typecheck in confusing ways.
---

When a task agent's merged work adds new columns/tables to `lib/db`'s drizzle schema source, the package's built `dist/` output is not automatically rebuilt as part of the merge. Consumers (api-server, store) then typecheck against the *old* compiled declaration files, not the new source.

**Symptom:** TypeScript errors like `Property 'reviewedAt' does not exist on type '{ ... }'` in files that reference a field you can plainly see in the schema source. The error looks like a bug in the consumer code, but the actual field is missing only from the stale `dist/schema/*.d.ts`.

**Why:** `lib/db` is a separately-built workspace package; its dist declarations are a build artifact, not something TS re-derives live from source during a consumer's `tsc --noEmit`.

**How to apply:** Whenever auditing/debugging code shortly after a task-agent merge that touched `lib/db/src/schema/*`, run `pnpm --filter @workspace/db exec tsc -b --force` (or the package's build script) before trusting any "property does not exist" typecheck error — rebuild first, then re-typecheck to see the real error surface.
