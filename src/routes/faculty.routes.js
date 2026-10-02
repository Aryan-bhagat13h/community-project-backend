import { Router } from "express";
import { createFacultyProfile } from '../controllers/faculty-profile.controller.js';
import { verifyJwt } from '../middlewares/auth.middlerware.js';
import { restrictedToFaculty } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToFaculty);

router.post("/", createFacultyProfile);

export default router;