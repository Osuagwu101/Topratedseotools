---
name: GitHub git-source-control authorization is separate from API connector and account login
description: Why gitPull/gitPush/createPullRequest can fail with NO_CREDENTIALS even after the GitHub connector/connection shows status added, and where the real fix lives.
---

Replit has three distinct GitHub-related authorizations that are easy to conflate:

1. **Account social login** (replit.com/account → Connected accounts) — only Google/Apple/etc. sign-in. Not related to git or GitHub API access at all.
2. **GitHub API connector/connection** (via `searchIntegrations`/`ProposeIntegration`, slug `github`) — grants an Octokit-style token for REST calls (`connectors.proxy("github", ...)`), used by the `query-integration-data` skill. Can show `status: "added"` yet `listConnections('github')` still returns `[]` inside the sandbox — that's credentials withheld for that context, not a missing connection (see `query-integration-data` skill).
3. **git-source-control credentials** (needed by `gitPull`/`gitPush`/`createPullRequest` CodeExecution callbacks, and by plain shell `git fetch`/`clone` via the `replit-git-askpass` helper) — this is a *third*, separate authorization. It lives in the **workspace's Git pane** (Tools panel in the sidebar → "Connect to GitHub"), not in account settings and not via the integrations/connector system.

**Why:** Hit `NO_CREDENTIALS` / "No github-source-control credentials found" from `gitPull` even though the GitHub connector showed `added`. Account settings only exposed social-login providers (no GitHub entry) — that was a dead end. Plain shell `git fetch` against the repo also failed with "Invalid username or token" until the Git pane connection was made; after connecting there, both plain `git fetch` and (expected) `gitPull` started working immediately.

**How to apply:** If `gitPull`/`gitPush`/raw `git fetch` fail with a credentials/auth error, don't retry `ProposeIntegration` for the GitHub connector (that's a different credential) and don't send the user to account settings. Tell them to open the **Git pane** (Tools → Git) in this workspace and click **"Connect to GitHub"**. Also: a private repo returns a plain 404 over anonymous HTTPS (`curl`/`git ls-remote` without auth) — that 404 does not by itself prove the repo doesn't exist, just that anonymous access is refused.
