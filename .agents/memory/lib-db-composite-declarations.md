---
name: lib/db composite declaration staleness
description: after adding exports to @workspace/db schema files, consuming packages can fail typecheck claiming the export doesn't exist even though the source is correct
---

`lib/db` is a TypeScript composite project that ships compiled `dist/*.d.ts` declaration files. Other workspace packages (e.g. `artifacts/api-server`) resolve `@workspace/db` imports against those compiled declarations, not the `.ts` source.

**Why:** after adding new schema/exports to `lib/db/src/schema/*.ts`, the stale `dist/*.d.ts` files don't reflect the new exports yet, so `tsc` in a consuming package reports "has no exported member" even though the source is fine.

**How to apply:** after changing `lib/db` exports, run `npx tsc -b tsconfig.json` inside `lib/db` to rebuild its declarations before typechecking/running any package that imports from `@workspace/db`.
