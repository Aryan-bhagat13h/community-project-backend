import { Router } from "express";
import {
  createStudentProfile, updateStudentProfile,
} from "../controllers/student-profile.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictedToStudent } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJWT, restrictedToStudent);

router.post("/", createStudentProfile);
router.patch("/me", updateStudentProfile);

export default router;