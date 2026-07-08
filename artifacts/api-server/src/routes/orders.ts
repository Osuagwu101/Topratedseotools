import { Router, type IRouter } from "express";
import { db, ordersTable, productsTable } from "@workspace/db";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [product] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, parsed.data.productId));

  if (!product) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  const reference = `SUB-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  const [order] = await db
    .insert(ordersTable)
    .values({
      productId: parsed.data.productId,
      customerEmail: parsed.data.customerEmail,
      customerName: parsed.data.customerName,
      amountKobo: product.priceKobo,
      status: "pending",
      reference,
    })
    .returning();

  res.status(201).json(CreateOrderResponse.parse({ ...order, createdAt: order.createdAt.toISOString() }));
});

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse({ id: req.params.id });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, params.data.id));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(GetOrderResponse.parse({ ...order, createdAt: order.createdAt.toISOString() }));
});

export default router;
