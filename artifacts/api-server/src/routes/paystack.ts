import { Router, type IRouter } from "express";
import { db, ordersTable } from "@workspace/db";
import {
  InitializePaymentBody,
  InitializePaymentResponse,
  VerifyPaymentParams,
  VerifyPaymentResponse,
} from "@workspace/api-zod";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? "";

router.post("/paystack/initialize", async (req, res): Promise<void> => {
  const parsed = InitializePaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { orderId, email, amountKobo } = parsed.data;

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order) {
    res.status(400).json({ error: "Order not found" });
    return;
  }

  try {
    const paystackRes = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountKobo,
        reference: order.reference,
        metadata: { orderId, customerName: order.customerName },
      }),
    });

    const paystackData = await paystackRes.json() as {
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
      })
    );
  } catch (err) {
    logger.error({ err }, "Paystack API error");
    res.status(500).json({ error: "Failed to initialize payment" });
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
    const paystackRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const paystackData = await paystackRes.json() as {
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

    const txStatus = paystackData.data.status;

    let orderId: number | null = null;

    if (txStatus === "success") {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.reference, reference));

      if (order) {
        orderId = order.id;
        await db
          .update(ordersTable)
          .set({ status: "paid" })
          .where(eq(ordersTable.reference, reference));
      }
    }

    res.json(
      VerifyPaymentResponse.parse({
        status: txStatus,
        reference: paystackData.data.reference,
        amount: paystackData.data.amount,
        orderId,
      })
    );
  } catch (err) {
    logger.error({ err }, "Paystack verify error");
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

export default router;
