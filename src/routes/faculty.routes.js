import { Router } from "express";
import {
  createFacultyProfile, updateFacultyProfile,
} from '../controllers/faculty-profile.controller.js';
import { verifyJwt } from '../middlewares/auth.middlerware.js';
import { restrictedToFaculty } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToFaculty);

router.post("/", createFacultyProfile);
router.patch("/me", updateFacultyProfile);

export default router;