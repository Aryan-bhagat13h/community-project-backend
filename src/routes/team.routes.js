import { Router } from "express";
import {
  createTeam,
  addMembers,
  getTeamRequests,
  acceptJoinRequest,
} from "../controllers/team.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";

const router = Router();
router.use(verifyJwt);

router.post("/", createTeam);
router.post("/:teamId/members", addMembers);
router.get("/:teamId/requests", getTeamRequests);
router.patch("/:teamId/requests/:requestId/accept", acceptJoinRequest);

export default router;
