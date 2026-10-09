import { Router } from "express";
import {
  createAdminProfile,
  updateAdminProfile,
  changeAdminType,
} from "../controllers/admin-profile.controller.js";
import {
  getAllProblems,
  updateVerificationStatus,
  rejectProblem,
  setSeverityUrgency,
} from "../controllers/admin-problem-controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";
import { restrictedToAdmin } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToAdmin);

// Admin Profile
router.post("/", createAdminProfile);
router.patch("/me", updateAdminProfile);
router.patch("/:userId/type", changeAdminType);

// Admin Problem Moderation
router.get("/problems", getAllProblems);
router.patch("/problems/:problemId/status", updateVerificationStatus);
router.patch("/problems/:problemId/reject", rejectProblem);
router.patch("/problems/:problemId/severity-urgency", setSeverityUrgency);

export default router;
