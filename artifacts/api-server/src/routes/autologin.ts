import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { resolveServerForUser } from "../lib/toolAccess";
import { decryptServerCredentials } from "../lib/toolCredentials";

const router: IRouter = Router();

// For isAutoLogin tools: redirect straight to the reverse proxy so all traffic
// comes from the server's single IP. Falls back to form-submit for non-proxy tools.
router.get("/tools/:productId/autologin", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).send("<h1>Unauthorized</h1><p>Please log in to SubsHub first.</p>");
    return;
  }

  const productId = parseInt(req.params.productId, 10);
  if (isNaN(productId)) {
    res.status(400).send("<h1>Invalid product</h1>");
    return;
  }

  // Resolve the specific server credential set assigned to this user's active
  // entitlement (same source of truth as the proxy).
  const serverRow = await resolveServerForUser(userId, productId);

  if (!serverRow) {
    res.status(403).send(`
      <!DOCTYPE html>
      <html>
      <head><title>No Active Subscription</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h2>No active subscription</h2>
        <p>You don't have an active subscription for this tool.</p>
        <a href="/">Return to SubsHub</a>
      </body>
      </html>
    `);
    return;
  }

  // Only decrypt once we know we actually need the plaintext credentials
  // below (the one-click/proxy branch never touches them directly).
  const server = decryptServerCredentials(serverRow);

  // For isAutoLogin tools, redirect to the reverse proxy (single IP / device)
  // — but only if the admin has switched on One-Click Auth for this tool.
  // Plain form-submit login (below) never uses the masking proxy, so it is
  // unaffected by the toggle and keeps working exactly as before.
  if (server.isAutoLogin) {
    const [product] = await db
      .select({ oneClickAuthEnabled: productsTable.oneClickAuthEnabled })
      .from(productsTable)
      .where(eq(productsTable.id, productId));
    if (!product?.oneClickAuthEnabled) {
      res.status(403).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Not Enabled</title></head>
        <body style="font-family:sans-serif;text-align:center;padding:60px;">
          <h2>One-Click Auth is not enabled</h2>
          <p>This tool's one-click login has not been turned on yet.</p>
          <a href="/">Return to SubsHub</a>
        </body>
        </html>
      `);
      return;
    }
    res.redirect(302, `/api/proxy/${productId}/`);
    return;
  }

  if (!server.loginUrl || !server.username || !server.password) {
    res.status(503).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Not Ready</title></head>
      <body style="font-family:sans-serif;text-align:center;padding:60px;">
        <h2>Login not yet configured</h2>
        <p>The admin hasn't set up auto-login for this tool yet. Please check back soon.</p>
        <a href="/">Return to SubsHub</a>
      </body>
      </html>
    `);
    return;
  }

  const usernameField = server.usernameField ?? "email";
  const passwordField = server.passwordField ?? "password";

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Connecting...</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Poppins', sans-serif;
      background: #f7f8f9;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      gap: 16px;
      color: #0f2217;
    }
    .spinner {
      width: 48px; height: 48px;
      border: 4px solid #e5e7eb;
      border-top-color: #24A45A;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 1.25rem; font-weight: 700; }
    p { color: #6b7280; font-size: 0.875rem; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h2>Connecting you to the tool…</h2>
  <p>You will be redirected automatically. Please wait.</p>

  <form id="f" method="POST" action="${server.loginUrl}" style="display:none;">
    <input name="${usernameField}" value="${escapeHtml(server.username)}" />
    <input name="${passwordField}" value="${escapeHtml(server.password)}" />
  </form>
  <script>
    // Give the spinner a moment to render, then submit
    setTimeout(function() { document.getElementById('f').submit(); }, 800);
  </script>
</body>
</html>`);
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default router;
