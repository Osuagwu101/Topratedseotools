import { Router, type IRouter, type Request } from "express";
import { db, ordersTable, productsTable } from "@workspace/db";
import {
  InitializePaymentBody,
  InitializePaymentResponse,
  VerifyPaymentParams,
  VerifyPaymentResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { logger } from "../lib/logger";
import { activateOrderByReference, markOrderFailed } from "../lib/activateOrder";
import { sendCapiEvent } from "../lib/metaCapi";
import { getPaymentSettings, resolveActivePaystackSecretKey, recordWebhookReceived } from "../lib/paymentSettings";

const router: IRouter = Router();

// Resolves the secret key that should be used *right now*, honoring both the
// admin's test/live mode toggle (payment_settings) and live key rotation from
// the System Configuration Centre (setConfigValue mirrors into process.env
// immediately — see lib/systemConfig.ts) — so neither requires a restart.
async function getPaystackSecretKey(): Promise<string> {
  const settings = await getPaymentSettings();
  return resolveActivePaystackSecretKey(settings);
}

/**
 * Look up the order and fire a server-side CAPI Purchase event.
 * Fire-and-forget: call with `void` so it never blocks the response.
 */
async function firePurchaseCapi(
  reference: string,
  clientIp: string,
  userAgent: string,
): Promise<void> {
  try {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.reference, reference));
    if (!order) return;
    await sendCapiEvent({
      eventName: "Purchase",
      eventId: `purchase_${reference}`,
      reference,
      userData: {
        email: order.customerEmail,
        externalId: order.clerkUserId ?? undefined,
        clientIpAddress: clientIp,
        clientUserAgent: userAgent,
      },
      customData: {
        value: order.amountKobo / 100,
        currency: "NGN",
        content_ids: [String(order.productId)],
        content_type: "product",
        order_id: reference,
        num_items: 1,
      },
    });
  } catch (err) {
    // sendCapiEvent itself never throws, but guard the DB lookup too
    logger.error({ err, reference }, "firePurchaseCapi unexpected error");
  }
}

router.post("/paystack/initialize", async (req, res): Promise<void> => {
  const parsed = InitializePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { orderId } = parsed.data;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) {
    res.status(400).json({ error: "Order not found" });
    return;
  }

  const paymentSettings = await getPaymentSettings();
  if (!paymentSettings.enabled) {
    res.status(400).json({ error: "Payments are currently unavailable. Please try again later." });
    return;
  }

  try {
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resolveActivePaystackSecretKey(paymentSettings)}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: order.customerEmail,
        amount: order.amountKobo,
        currency: order.currency ?? paymentSettings.currency,
        reference: order.reference,
        metadata: { orderId, customerName: order.customerName },
      }),
    });

    const paystackData = (await paystackRes.json()) as {
      status: boolean;
      data?: { authorization_url: string; reference: string };
      message?: string;
    };

    if (!paystackData.status || !paystackData.data) {
      req.log.error({ paystackData }, "Paystack initialization failed");
      res.status(400).json({ error: paystackData.message ?? "Payment initialization failed" });
      return;
    }

    res.json(
      InitializePaymentResponse.parse({
        authorizationUrl: paystackData.data.authorization_url,
        reference: paystackData.data.reference,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Paystack API error");
    res.status(500).json({ error: "Failed to initialize payment" });
  }
});

// Paystack webhook — the source of truth for payment activation. Configure this URL
// (`/api/paystack/webhook`) in the Paystack dashboard. Paystack retries on non-200
// responses, so this handler must be idempotent (see activateOrderByReference).
router.post("/paystack/webhook", async (req, res): Promise<void> => {
  const signature = req.headers["x-paystack-signature"];
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  const paystackSecretKey = await getPaystackSecretKey();
  if (!paystackSecretKey || !rawBody || typeof signature !== "string") {
    logger.error("Paystack webhook missing signature or raw body");
    res.status(400).send("Invalid request");
    return;
  }

  const expectedSignature = crypto
    .createHmac("sha512", paystackSecretKey)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature !== signature) {
    logger.error("Paystack webhook signature mismatch — rejecting");
    res.status(400).send("Invalid signature");
    return;
  }

  // Signature is valid, so this is a genuine delivery from Paystack — record it
  // for the Verify Webhooks diagnostic regardless of event type or outcome below.
  void recordWebhookReceived();

  const event = req.body as {
    event?: string;
    data?: { reference?: string; amount?: number };
  };

  const reference = event.data?.reference;
  if (!reference) {
    res.status(400).send("Missing reference");
    return;
  }

  try {
    if (event.event === "charge.success") {
      // Never trust the webhook body amount alone — re-verify server-side with Paystack.
      const verifyRes = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${paystackSecretKey}` } },
      );
      const verifyData = (await verifyRes.json()) as {
        status: boolean;
        data?: { status: string; amount: number };
      };

      if (verifyData.status && verifyData.data?.status === "success") {
        const result = await activateOrderByReference(reference, verifyData.data.amount);
        logger.info({ reference, result: result.outcome }, "Paystack webhook processed");
        if (result.outcome === "activated") {
          void firePurchaseCapi(reference, req.ip ?? "", req.get("user-agent") ?? "");
        }
      } else {
        await markOrderFailed(reference);
        logger.error({ reference, verifyData }, "Paystack webhook charge.success but re-verify failed");
      }
    } else if (
      event.event === "charge.failed" ||
      event.event === "charge.dispute.create" ||
      event.event === "transaction.reversed"
    ) {
      await markOrderFailed(reference);
    }

    // Always 200 once handled (or intentionally ignored) so Paystack stops retrying.
    res.status(200).send("ok");
  } catch (err) {
    logger.error({ err, reference }, "Paystack webhook processing error");
    // Non-200 so Paystack retries later — the handler is idempotent.
    res.status(500).send("error");
  }
});

router.get("/paystack/verify/:reference", async (req, res): Promise<void> => {
  const params = VerifyPaymentParams.safeParse({ reference: req.params.reference });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { reference } = params.data;

  try {
    const paystackRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${await getPaystackSecretKey()}`,
        },
      },
    );

    const paystackData = (await paystackRes.json()) as {
      status: boolean;
      data?: {
        status: string;
        reference: string;
        amount: number;
      };
      message?: string;
    };

    if (!paystackData.status || !paystackData.data) {
      res.status(400).json({ error: paystackData.message ?? "Verification failed" });
      return;
    }

    let txStatus: string = paystackData.data.status;
    let orderId: number | null = null;
    let productName: string | null = null;

    if (txStatus === "success") {
      const result = await activateOrderByReference(reference, paystackData.data.amount);
      orderId = result.orderId;
      if (result.outcome === "underpaid") {
        txStatus = "underpaid";
      }
      // "activated" and "already_active" both reflect a successful, entitled order —
      // this mirrors whatever the webhook already produced (or will produce shortly).
      if (result.outcome === "activated") {
        void firePurchaseCapi(reference, req.ip ?? "", req.get("user-agent") ?? "");
      }
    }

    // Look up the product name for the order so the success page can display it.
    if (orderId !== null) {
      try {
        const [row] = await db
          .select({ name: productsTable.name })
          .from(ordersTable)
          .innerJoin(productsTable, eq(ordersTable.productId, productsTable.id))
          .where(eq(ordersTable.id, orderId))
          .limit(1);
        productName = row?.name ?? null;
      } catch {
        // non-fatal — success page falls back gracefully when null
      }
    }

    res.json(
      VerifyPaymentResponse.parse({
        status: txStatus,
        reference: paystackData.data.reference,
        amount: paystackData.data.amount,
        orderId,
        productName,
      }),
    );
  } catch (err) {
    logger.error({ err }, "Paystack verify error");
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

export default router;
