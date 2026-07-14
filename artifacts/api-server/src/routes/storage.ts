import { Router, type IRouter, type Request, type Response } from "express";
import { getStorageBackend } from "../lib/storage";

const router: IRouter = Router();

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets (blog images, tool logos, site logo/hero, etc.) from
 * whichever storage backend is currently configured (Replit-managed bucket,
 * S3-compatible bucket, or local disk). These are unconditionally public —
 * no authentication or ACL checks — matching every current upload flow.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const backend = await getStorageBackend();
    const result = await backend.getObjectStream(filePath);
    if (!result) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    res.setHeader("Content-Type", result.contentType);
    if (result.sizeBytes !== undefined) res.setHeader("Content-Length", String(result.sizeBytes));
    result.stream.pipe(res);
    result.stream.on("error", (err) => {
      req.log.error({ err }, "Error streaming public object");
      if (!res.headersSent) res.status(500);
      res.end();
    });
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
