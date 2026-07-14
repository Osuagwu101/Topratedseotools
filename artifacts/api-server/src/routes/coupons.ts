import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, couponsTable, couponRedemptionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireSuperAdmin } from "../lib/staffAuth";
import { logger } from "../lib/logger";
import { validateCoupon, normalizeCouponCode } from "../lib/coupons";

const router: IRouter = Router();

router.post("/coupons/validate", async (req, res): Promise<void> => {
  try {
    const { code, productId, durationMonths } = req.body as {
      code?: string;
      productId?: number;
      durationMonths?: number;
    };
    if (!code || typeof code !== "string" || !Number.isInteger(productId)) {
      res.status(400).json({ ok: false, error: "A coupon code and productId are required." });
      return;
    }

    const auth = getAuth(req);
    const clerkUserId = auth?.userId ?? null;

    // Resolve the product's price for the requested duration the same way order
    // creation does, so the preview matches exactly what checkout will charge.
    const { productsTable } = await import("@workspace/db");
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId!));
    if (!product) {
      res.status(400).json({ ok: false, error: "Product not found." });
      return;
    }
    const duration = durationMonths ?? 1;
    const priceByDuration: Record<number, number | null> = {
      1: product.priceKobo,
      3: product.price3MonthKobo,
      12: product.price12MonthKobo,
    };
    const baseAmountKobo = priceByDuration[duration] ?? product.priceKobo;

    const result = await validateCoupon({
      code,
      productId: productId!,
      baseAmountKobo: baseAmountKobo ?? 0,
      clerkUserId,
      customerEmail: null,
    });

    if (!result.ok) {
      res.json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, discountKobo: result.discountKobo, code: result.coupon.code });
  } catch (err) {
    logger.error({ err }, "Coupon validation failed");
    res.status(500).json({ ok: false, error: "Could not validate coupon right now." });
  }
});

router.get("/admin/coupons", requireSuperAdmin, async (_req, res): Promise<void> => {
  try {
    const coupons = await db.select().from(couponsTable).orderBy(desc(couponsTable.createdAt));
    res.json(coupons);
  } catch (err) {
    logger.error({ err }, "Failed to list coupons");
    res.status(500).json({ error: "Failed to list coupons" });
  }
});

function validateCouponInput(body: Record<string, unknown>): string | null {
  if (typeof body.code !== "string" || !body.code.trim()) return "Code is required.";
  if (body.discountType !== "percentage" && body.discountType !== "fixed") {
    return "discountType must be 'percentage' or 'fixed'.";
  }
  if (!Number.isInteger(body.discountValue) || (body.discountValue as number) < 0) {
    return "discountValue must be a non-negative whole number.";
  }
  if (body.discountType === "percentage" && (body.discountValue as number) > 100) {
    return "Percentage discounts cannot exceed 100.";
  }
  if (body.scope !== undefined && body.scope !== "all" && body.scope !== "selected") {
    return "scope must be 'all' or 'selected'.";
  }
  if (body.scope === "selected" && (!Array.isArray(body.productIds) || body.productIds.length === 0)) {
    return "At least one product must be selected for a scoped coupon.";
  }
  return null;
}

router.post("/admin/coupons", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const body = req.body as Record<string, unknown>;
    const error = validateCouponInput(body);
    if (error) {
      res.status(400).json({ error });
      return;
    }
    const [created] = await db
      .insert(couponsTable)
      .values({
        code: normalizeCouponCode(body.code as string),
        description: (body.description as string) ?? null,
        discountType: body.discountType as string,
        discountValue: body.discountValue as number,
        scope: (body.scope as string) ?? "all",
        productIds: (body.productIds as number[]) ?? [],
        minPurchaseKobo: (body.minPurchaseKobo as number) ?? 0,
        maxDiscountKobo: (body.maxDiscountKobo as number) ?? null,
        usageLimitTotal: (body.usageLimitTotal as number) ?? null,
        usageLimitPerCustomer: (body.usageLimitPerCustomer as number) ?? null,
        requiresLogin: (body.requiresLogin as boolean) ?? false,
        active: (body.active as boolean) ?? true,
        startsAt: body.startsAt ? new Date(body.startsAt as string) : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt as string) : null,
        createdBy: req.staffUser?.email ?? "admin",
      })
      .returning();
    res.status(201).json(created);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(400).json({ error: "A coupon with this code already exists." });
      return;
    }
    logger.error({ err }, "Failed to create coupon");
    res.status(500).json({ error: "Failed to create coupon" });
  }
});

router.put("/admin/coupons/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid coupon id" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    // Only re-validate the fields that were actually part of the coupon's
    // discount identity — this endpoint allows partial updates (e.g. just
    // toggling `active`) without resending the whole object.
    if (body.code !== undefined || body.discountType !== undefined || body.discountValue !== undefined || body.scope !== undefined) {
      const [existing] = await db.select().from(couponsTable).where(eq(couponsTable.id, id));
      if (!existing) {
        res.status(404).json({ error: "Coupon not found" });
        return;
      }
      const merged = {
        code: body.code ?? existing.code,
        discountType: body.discountType ?? existing.discountType,
        discountValue: body.discountValue ?? existing.discountValue,
        scope: body.scope ?? existing.scope,
        productIds: body.productIds ?? existing.productIds,
      };
      const fullError = validateCouponInput(merged);
      if (fullError) {
        res.status(400).json({ error: fullError });
        return;
      }
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.code !== undefined) patch.code = normalizeCouponCode(body.code as string);
    if (body.description !== undefined) patch.description = body.description;
    if (body.discountType !== undefined) patch.discountType = body.discountType;
    if (body.discountValue !== undefined) patch.discountValue = body.discountValue;
    if (body.scope !== undefined) patch.scope = body.scope;
    if (body.productIds !== undefined) patch.productIds = body.productIds;
    if (body.minPurchaseKobo !== undefined) patch.minPurchaseKobo = body.minPurchaseKobo;
    if (body.maxDiscountKobo !== undefined) patch.maxDiscountKobo = body.maxDiscountKobo;
    if (body.usageLimitTotal !== undefined) patch.usageLimitTotal = body.usageLimitTotal;
    if (body.usageLimitPerCustomer !== undefined) patch.usageLimitPerCustomer = body.usageLimitPerCustomer;
    if (body.requiresLogin !== undefined) patch.requiresLogin = body.requiresLogin;
    if (body.active !== undefined) patch.active = body.active;
    if (body.startsAt !== undefined) patch.startsAt = body.startsAt ? new Date(body.startsAt as string) : null;
    if (body.expiresAt !== undefined) patch.expiresAt = body.expiresAt ? new Date(body.expiresAt as string) : null;

    const [updated] = await db.update(couponsTable).set(patch).where(eq(couponsTable.id, id)).returning();
    if (!updated) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    res.json(updated);
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
      res.status(400).json({ error: "A coupon with this code already exists." });
      return;
    }
    logger.error({ err }, "Failed to update coupon");
    res.status(500).json({ error: "Failed to update coupon" });
  }
});

router.delete("/admin/coupons/:id", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [deleted] = await db.delete(couponsTable).where(eq(couponsTable.id, id)).returning();
    if (!deleted) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "Failed to delete coupon");
    res.status(500).json({ error: "Failed to delete coupon" });
  }
});

router.get("/admin/coupons/:id/redemptions", requireSuperAdmin, async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const redemptions = await db
      .select()
      .from(couponRedemptionsTable)
      .where(eq(couponRedemptionsTable.couponId, id))
      .orderBy(desc(couponRedemptionsTable.createdAt));
    res.json(redemptions);
  } catch (err) {
    logger.error({ err }, "Failed to list coupon redemptions");
    res.status(500).json({ error: "Failed to list coupon redemptions" });
  }
});

export default router;
