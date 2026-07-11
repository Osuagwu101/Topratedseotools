import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, ordersTable, productsTable, orderAttributionsTable } from "@workspace/db";
import {
  CreateOrderBody,
  CreateOrderResponse,
  GetOrderParams,
  GetOrderResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { logger } from "../lib/logger";

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

  if (!product || product.isDeleted || product.isHidden) {
    res.status(400).json({ error: "Product not found" });
    return;
  }

  const reference = `SUB-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;

  // Associate order with logged-in user if authenticated
  const auth = getAuth(req);
  const clerkUserId = auth?.userId ?? null;

  const durationMonths = parsed.data.durationMonths ?? 1;
  const priceByDuration: Record<number, number | null> = {
    1: product.priceKobo,
    3: product.price3MonthKobo,
    12: product.price12MonthKobo,
  };
  const amountKobo = priceByDuration[durationMonths];
  if (durationMonths !== 1 && (amountKobo === undefined || amountKobo === null)) {
    res.status(400).json({ error: `No price configured for ${durationMonths}-month duration` });
    return;
  }

  const [order] = await db
    .insert(ordersTable)
    .values({
      productId: parsed.data.productId,
      customerEmail: parsed.data.customerEmail,
      customerName: parsed.data.customerName,
      amountKobo: amountKobo ?? product.priceKobo,
      status: "pending",
      reference,
      clerkUserId,
      durationMonths,
    })
    .returning();

  // Persist UTM/click attribution sent by the client via X-Attribution header (optional)
  const attributionHeader = req.headers["x-attribution"];
  if (typeof attributionHeader === "string" && attributionHeader) {
    try {
      const attr = JSON.parse(attributionHeader) as {
        utmSource?: string;
        utmMedium?: string;
        utmCampaign?: string;
        utmContent?: string;
        utmTerm?: string;
        fbclid?: string;
        gclid?: string;
        fbp?: string;
        fbc?: string;
      };
      await db.insert(orderAttributionsTable).values({
        orderId: order.id,
        utmSource: attr.utmSource ?? null,
        utmMedium: attr.utmMedium ?? null,
        utmCampaign: attr.utmCampaign ?? null,
        utmContent: attr.utmContent ?? null,
        utmTerm: attr.utmTerm ?? null,
        fbclid: attr.fbclid ?? null,
        gclid: attr.gclid ?? null,
        fbp: attr.fbp ?? null,
        fbc: attr.fbc ?? null,
      }).onConflictDoNothing();
    } catch (err) {
      // Non-fatal — attribution is best-effort
      logger.warn({ err, orderId: order.id }, "Failed to save order attribution");
    }
  }

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
