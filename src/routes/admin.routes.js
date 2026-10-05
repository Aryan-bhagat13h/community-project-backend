import { Router } from "express";
import {
  createAdminProfile,
  updateAdminProfile,
  changeAdminType,
} from "../controllers/admin-profile.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";
import { restrictedToAdmin } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToAdmin);

router.post("/", createAdminProfile);
router.patch("/me", updateAdminProfile);
router.patch("/:userId/type", changeAdminType);

export default router;
