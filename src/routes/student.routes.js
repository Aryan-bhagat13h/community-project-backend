import { Router } from "express";
import {
  createStudentProfile, updateStudentProfile,
} from '../controllers/student-profile.controller.js'
import { verifyJwt } from '../middlewares/auth.middlerware.js';
import { restrictedToStudent } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToStudent);

router.post("/", createStudentProfile);
router.patch("/me", updateStudentProfile);

export default router;