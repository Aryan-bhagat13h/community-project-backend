import { Router } from "express";
import {
  registerUser, loginUser, logoutUser, refreshAccessToken,
} from '../controllers/user.controller.js'
import { verifyJwt } from "../middlewares/auth.middlerware.js";

const router = Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh-token", refreshAccessToken);
router.post("/logout", verifyJwt, logoutUser);

export default router;