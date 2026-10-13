import { Router } from "express";
import {
  createStudentProfile, updateStudentProfile,
} from '../controllers/student-profile.controller.js';
import {
  browseProblems, savedProblem, unsaveProblem, getSavedProblems,
  adoptProblem, abandonProblem,
  createProject, getMyProjects, getProject, updateProject, deleteProject,
  findMentor, sendMentorRequest,
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

// Problem Adoption & Abandonment
router.post("/problems/:problemId/adopt", adoptProblem);
router.post("/problems/:problemId/abandon", abandonProblem);
router.delete("/problems/:problemId/adopt", abandonProblem);

// Projects
router.post("/projects", createProject);
router.get("/projects", getMyProjects);
router.get("/projects/:projectId", getProject);
router.patch("/projects/:projectId", updateProject);
router.delete("/projects/:projectId", deleteProject);

// Mentorship
router.get("/teams/:teamId/mentors", findMentor);
router.post("/teams/:teamId/mentors/:facultyId/request", sendMentorRequest);

export default router;