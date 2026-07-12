import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import ordersRouter from "./orders";
import paystackRouter from "./paystack";
import usersRouter from "./users";
import adminRouter from "./admin";
import autologinRouter from "./autologin";
import proxyRouter from "./proxy";
import storageRouter from "./storage";
import fxRouter from "./fx";
import siteSettingsRouter from "./siteSettings";
import trackingRouter from "./tracking";
import trustRouter from "./trust";
import toolAssignmentsRouter from "./toolAssignments";
import homepageContentRouter from "./homepageContent";
import { deviceTrackingMiddleware } from "../middlewares/deviceTracking";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storageRouter);
router.use(fxRouter);
router.use(siteSettingsRouter);
router.use(trackingRouter);
router.use(trustRouter);
router.use(toolAssignmentsRouter);
router.use(homepageContentRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(paystackRouter);
router.use(deviceTrackingMiddleware);
router.use(usersRouter);
router.use(adminRouter);
router.use(autologinRouter);
router.use(proxyRouter);

export default router;
