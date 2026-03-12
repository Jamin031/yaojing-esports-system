import { Router } from "express";
import authRoutes from "./authRoutes.js";
import storeRoutes from "./storeRoutes.js";
import packageRoutes from "./packageRoutes.js";
import playerRoutes from "./playerRoutes.js";
import orderRoutes from "./orderRoutes.js";
import statsRoutes from "./statsRoutes.js";
import internalRoutes from "./internalRoutes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/stores", storeRoutes);
router.use("/packages", packageRoutes);
router.use("/players", playerRoutes);
router.use("/orders", orderRoutes);
router.use("/stats", statsRoutes);
router.use("/internal", internalRoutes);

export default router;

