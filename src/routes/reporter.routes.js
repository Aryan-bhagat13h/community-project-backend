import { Router } from "express";
import {
  createReporterProfile,
  updateReporterProfile,
} from "../controllers/reporter-profile.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";
import { restrictedToReporter } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToReporter);

router.post("/", createReporterProfile);
router.patch("/me", updateReporterProfile);

export default router;
