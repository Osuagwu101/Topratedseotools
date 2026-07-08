import { type RequestHandler } from "express";
import { getAuth } from "@clerk/express";
import { db, userDeviceSessionsTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

const MAX_DEVICES = 3;

export const deviceTrackingMiddleware: RequestHandler = async (req, res, next) => {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    next();
    return;
  }

  const deviceId = (req.headers["x-device-id"] as string | undefined)?.trim();
  if (!deviceId) {
    next();
    return;
  }

  const userAgent = (req.headers["user-agent"] as string | undefined) ?? null;
  const ipAddress = req.ip ?? null;

  const [countRow] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(userDeviceSessionsTable)
    .where(eq(userDeviceSessionsTable.userId, userId));

  const totalDevices = countRow?.count ?? 0;

  if (totalDevices > MAX_DEVICES) {
    res.status(403).json({
      error: "account_suspended",
      message:
        "Your account has been suspended due to logging in on too many devices. Please contact the administrator.",
    });
    return;
  }

  const [existing] = await db
    .select({ id: userDeviceSessionsTable.id })
    .from(userDeviceSessionsTable)
    .where(
      and(
        eq(userDeviceSessionsTable.userId, userId),
        eq(userDeviceSessionsTable.deviceId, deviceId),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(userDeviceSessionsTable)
      .set({ lastSeenAt: new Date() })
      .where(eq(userDeviceSessionsTable.id, existing.id));
  } else {
    if (totalDevices >= MAX_DEVICES) {
      res.status(403).json({
        error: "account_suspended",
        message:
          "Your account has been suspended due to logging in on too many devices. Please contact the administrator.",
      });
      return;
    }

    await db.insert(userDeviceSessionsTable).values({
      userId,
      deviceId,
      userAgent,
      ipAddress,
    });
  }

  next();
};
