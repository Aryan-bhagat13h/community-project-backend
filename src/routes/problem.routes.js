import { Router } from "express";
import { registerProblem } from "../controllers/problem.controller.js";
import { verifyJwt } from "../middlewares/auth.middlerware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();
router.use(verifyJwt);

const problemUpload = upload.fields([
  { name: "problemPhoto", maxCount: 1 },
  { name: "problemVideo", maxCount: 1 },
]);

router.post("/", problemUpload, registerProblem);

export default router;
