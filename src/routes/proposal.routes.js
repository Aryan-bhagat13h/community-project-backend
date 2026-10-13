import { Router } from "express";
import {
  createProposal,
  updateProposal,
  deleteProposal,
  getProposal,
} from "../controllers/proposal.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";

const router = Router();
router.use(verifyJwt);

router.post("/", createProposal);
router.get("/:proposalId", getProposal);
router.patch("/:proposalId", updateProposal);
router.delete("/:proposalId", deleteProposal);

export default router;
