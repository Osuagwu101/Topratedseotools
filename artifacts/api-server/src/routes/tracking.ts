import { Router, type IRouter } from "express";
import { getPublicTrackingConfig } from "../lib/analyticsSettings";

const router: IRouter = Router();

router.get("/tracking/config", async (_req, res): Promise<void> => {
  const config = await getPublicTrackingConfig();
  res.json(config);
});

export default router;
