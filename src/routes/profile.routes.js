import { Router } from "express";
import {
  createProfile, editProfile, updateProfilePhoto,
} from "../controllers/profile.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();
router.use(verifyJWT);

const photoUpload = upload.fields([{ name: "profilePhoto", maxCount: 1 }]);

router.post("/", photoUpload, createProfile);
router.patch("/me", editProfile);
router.patch("/me/photo", photoUpload, updateProfilePhoto);

export default router;