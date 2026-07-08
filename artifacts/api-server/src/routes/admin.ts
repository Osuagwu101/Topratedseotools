import { Router, type IRouter, type RequestHandler } from "express";
import { db, toolCredentialsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    res.status(503).json({ error: "ADMIN_SECRET not configured. Set it in environment secrets." });
    return;
  }
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

// List all products with their credentials
router.get("/admin/products", requireAdmin, async (_req, res): Promise<void> => {
  const products = await db.select().from(productsTable).orderBy(productsTable.id);
  const creds = await db.select().from(toolCredentialsTable);
  const credMap = Object.fromEntries(creds.map((c) => [c.productId, c]));

  res.json(
    products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      credential: credMap[p.id] ?? null,
    }))
  );
});

// Create or update credential for a product
router.post("/admin/credentials", requireAdmin, async (req, res): Promise<void> => {
  const body = req.body as {
    productId?: unknown;
    username?: unknown;
    password?: unknown;
    loginUrl?: unknown;
    usernameField?: unknown;
    passwordField?: unknown;
    isAutoLogin?: unknown;
    notes?: unknown;
  };

  const productId = typeof body.productId === "number" ? body.productId : null;
  if (!productId) {
    res.status(400).json({ error: "productId is required and must be a number" });
    return;
  }

  const fields = {
    username: typeof body.username === "string" ? body.username : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    loginUrl: typeof body.loginUrl === "string" ? body.loginUrl : undefined,
    usernameField: typeof body.usernameField === "string" ? body.usernameField : undefined,
    passwordField: typeof body.passwordField === "string" ? body.passwordField : undefined,
    isAutoLogin: typeof body.isAutoLogin === "boolean" ? body.isAutoLogin : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  };

  const existing = await db
    .select()
    .from(toolCredentialsTable)
    .where(eq(toolCredentialsTable.productId, productId));

  if (existing.length > 0) {
    const [updated] = await db
      .update(toolCredentialsTable)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(toolCredentialsTable.productId, productId))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(toolCredentialsTable)
      .values({ productId, ...fields })
      .returning();
    res.json(created);
  }
});

export default router;
