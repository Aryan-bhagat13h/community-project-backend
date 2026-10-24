import { Router } from "express";
import {
  createTeam,
  addMembers,
  getTeamRequests,
  acceptJoinRequest,
  sendJoinRequest,
  rejectJoinRequest,
  removeTeamMember
} from "../controllers/team.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";
import { getMyTeam } from "../controllers/team.controller.js";

const router = Router();
router.use(verifyJwt);

router.post("/", createTeam);
router.post("/:teamId/members", addMembers);
router.get("/:teamId/requests", getTeamRequests);
router.patch("/:teamId/requests/:requestId/accept", acceptJoinRequest);
router.post("/:teamId/requests", sendJoinRequest);
router.patch("/:teamId/requests/:requestId/reject", rejectJoinRequest);
router.get("/my", verifyJwt, getMyTeam);
router.delete("/:teamId/members/:memberId", verifyJwt, removeTeamMember);

export default router;
