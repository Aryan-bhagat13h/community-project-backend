import { Router } from "express";
import { createFacultyProfile } from "../controllers/faculty-profile.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictedToFaculty } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJWT, restrictedToFaculty);

router.post("/", createFacultyProfile);

export default router;