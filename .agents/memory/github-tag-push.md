---
name: GitHub tag push via connector
description: how to push a new git tag to the connected GitHub remote from this environment
---

The GitHub integration is authorized as a connector, not a plain git remote with local credentials. To push a tag (or any ref) to GitHub, use the `@replit/connectors-sdk` package's `ReplitConnectors.proxy` method inside an impure CodeExecution block to get a short-lived authenticated remote URL/token, then run the actual `git push` over that authenticated remote — plain `git push` with the repo's default remote will not have credentials.

**Why:** the workspace has no long-lived GitHub PAT/SSH key sitting in the environment; auth is brokered per-request through the connector.

**How to apply:** when asked to push a tag or branch to GitHub, read the `git-remote` skill first — it documents the exact connector proxy call and push sequence.
