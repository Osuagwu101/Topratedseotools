import { Router, type IRouter, type RequestHandler } from "express";
import { db, toolCredentialsTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";

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

const CredentialBody = z.object({
  productId: z.number().int(),
  username: z.string().optional(),
  password: z.string().optional(),
  loginUrl: z.string().optional(),
  usernameField: z.string().optional(),
  passwordField: z.string().optional(),
  isAutoLogin: z.boolean().optional(),
  notes: z.string().optional(),
});

// Create or update credential for a product
router.post("/admin/credentials", requireAdmin, async (req, res): Promise<void> => {
  const parsed = CredentialBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { productId, ...fields } = parsed.data;

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
