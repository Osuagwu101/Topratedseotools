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

const MONNIFY_BASE_URL = process.env.MONNIFY_BASE_URL ?? "https://sandbox.monnify.com";
const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY ?? "";
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY ?? "";
const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE ?? "";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getMonnifyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.token;
  }

  const credentials = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString("base64");

  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
  });

  const data = (await res.json()) as {
    requestSuccessful: boolean;
    responseBody?: { accessToken: string; expiresIn: number };
    responseMessage?: string;
  };

  if (!data.requestSuccessful || !data.responseBody) {
    throw new Error(data.responseMessage ?? "Failed to authenticate with Monnify");
  }

  cachedToken = {
    token: data.responseBody.accessToken,
    expiresAt: Date.now() + (data.responseBody.expiresIn - 30) * 1000,
  };

  return cachedToken.token;
}

function getPublicOrigin(req: { protocol: string; get(name: string): string | undefined }): string {
  const forwardedProto = req.get("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim() || req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

router.post("/monnify/initialize", async (req, res): Promise<void> => {
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

  try {
    const token = await getMonnifyToken();
    const redirectUrl = `${getPublicOrigin(req)}/success?reference=${encodeURIComponent(order.reference)}`;

    const monnifyRes = await fetch(`${MONNIFY_BASE_URL}/api/v1/merchant/transactions/init-transaction`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: order.amountKobo / 100,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        paymentReference: order.reference,
        paymentDescription: `SubsHub order #${order.id}`,
        currencyCode: "NGN",
        contractCode: MONNIFY_CONTRACT_CODE,
        redirectUrl,
        metadata: { orderId },
      }),
    });

    const monnifyData = (await monnifyRes.json()) as {
      requestSuccessful: boolean;
      responseBody?: { checkoutUrl: string; paymentReference: string };
      responseMessage?: string;
    };

    if (!monnifyData.requestSuccessful || !monnifyData.responseBody) {
      req.log.error({ monnifyData }, "Monnify initialization failed");
      res.status(400).json({ error: monnifyData.responseMessage ?? "Payment initialization failed" });
      return;
    }

    res.json(
      InitializePaymentResponse.parse({
        authorizationUrl: monnifyData.responseBody.checkoutUrl,
        reference: monnifyData.responseBody.paymentReference,
      })
    );
  } catch (err) {
    logger.error({ err }, "Monnify API error");
    res.status(500).json({ error: "Failed to initialize payment" });
  }
});

router.get("/monnify/verify/:reference", async (req, res): Promise<void> => {
  const params = VerifyPaymentParams.safeParse({ reference: req.params.reference });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const { reference } = params.data;

  try {
    const token = await getMonnifyToken();

    const monnifyRes = await fetch(
      `${MONNIFY_BASE_URL}/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const monnifyData = (await monnifyRes.json()) as {
      requestSuccessful: boolean;
      responseBody?: {
        paymentStatus: string;
        paymentReference: string;
        amountPaid: number;
      };
      responseMessage?: string;
    };

    if (!monnifyData.requestSuccessful || !monnifyData.responseBody) {
      res.status(400).json({ error: monnifyData.responseMessage ?? "Verification failed" });
      return;
    }

    const monnifyStatus = monnifyData.responseBody.paymentStatus;
    const amountPaidKobo = Math.round((monnifyData.responseBody.amountPaid ?? 0) * 100);

    let txStatus = monnifyStatus === "PAID" ? "success" : "failed";

    let orderId: number | null = null;

    if (txStatus === "success") {
      const [order] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.reference, reference));

      if (order) {
        orderId = order.id;

        if (amountPaidKobo < order.amountKobo) {
          req.log.error(
            {
              reference,
              paidAmount: amountPaidKobo,
              expectedAmount: order.amountKobo,
            },
            "Monnify verify amount mismatch — refusing to activate order"
          );
          txStatus = "underpaid";
          await db
            .update(ordersTable)
            .set({ status: "failed" })
            .where(eq(ordersTable.reference, reference));
        } else {
          await db
            .update(ordersTable)
            .set({ status: "success" })
            .where(eq(ordersTable.reference, reference));
        }
      }
    }

    res.json(
      VerifyPaymentResponse.parse({
        status: txStatus,
        reference: monnifyData.responseBody.paymentReference,
        amount: amountPaidKobo,
        orderId,
      })
    );
  } catch (err) {
    logger.error({ err }, "Monnify verify error");
    res.status(500).json({ error: "Failed to verify payment" });
  }
});

export default router;
