import { Router } from "express";
import {
  createFacultyProfile, updateFacultyProfile,
} from '../controllers/faculty-profile.controller.js';
import {
  getMentorshipRequests,
  acceptMentorshipRequest,
  rejectMentorshipRequest,
  rejectProposal,
  suggestChanges,
} from '../controllers/faculty.controller.js';
import { verifyJwt } from '../middlewares/auth.middlerware.js';
import { restrictedToFaculty } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJwt, restrictedToFaculty);

// Faculty Profile
router.post("/", createFacultyProfile);
router.patch("/me", updateFacultyProfile);

// Mentorship Requests
router.get("/mentorship-requests", getMentorshipRequests);
router.patch("/mentorship-requests/accept", acceptMentorshipRequest);
router.patch("/mentorship-requests/reject", rejectMentorshipRequest);

// Proposals Review
router.patch("/proposals/:proposalId/reject", rejectProposal);
router.post("/proposals/:proposalId/suggestions", suggestChanges);

export default router;