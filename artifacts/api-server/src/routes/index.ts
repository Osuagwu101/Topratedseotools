import { Router, type IRouter } from "express";
import healthRouter from "./health";
import productsRouter from "./products";
import ordersRouter from "./orders";
import paystackRouter from "./paystack";
import usersRouter from "./users";
import adminRouter from "./admin";
import autologinRouter from "./autologin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(productsRouter);
router.use(ordersRouter);
router.use(paystackRouter);
router.use(usersRouter);
router.use(adminRouter);
router.use(autologinRouter);

export default router;
