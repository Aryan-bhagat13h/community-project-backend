import { Router } from "express";
import {
  createTeam,
  addMembers,
  getTeamRequests,
  acceptJoinRequest,
  sendJoinRequest,
  rejectJoinRequest
} from "../controllers/team.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";

const router = Router();
router.use(verifyJwt);

router.post("/", createTeam);
router.post("/:teamId/members", addMembers);
router.get("/:teamId/requests", getTeamRequests);
router.patch("/:teamId/requests/:requestId/accept", acceptJoinRequest);
router.post("/:teamId/requests", sendJoinRequest);
router.patch("/:teamId/requests/:requestId/reject", rejectJoinRequest);

export default router;
