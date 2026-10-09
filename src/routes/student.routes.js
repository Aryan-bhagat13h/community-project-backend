import { Router } from "express";
import {
  createStudentProfile, updateStudentProfile,
} from '../controllers/student-profile.controller.js';
import {
  browseProblems, savedProblem, unsaveProblem, getSavedProblems,
} from '../controllers/student.controller.js';
import { verifyJwt } from '../middlewares/auth.middlerware.js';
import { restrictedToStudent } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToStudent);

// Student Profile
router.post("/", createStudentProfile);
router.patch("/me", updateStudentProfile);

// Student Problem Browsing & Saving
router.get("/problems", browseProblems);
router.get("/problems/saved", getSavedProblems);
router.post("/problems/:problemId/save", savedProblem);
router.delete("/problems/:problemId/save", unsaveProblem);

export default router;