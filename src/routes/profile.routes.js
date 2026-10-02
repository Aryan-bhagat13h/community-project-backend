import { Router } from "express";
import {
  createProfile, editProfile, updateProfilePhoto,
} from '../controllers/profile.controller.js'
import { verifyJwt } from "../middlewares/auth.middlerware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();
router.use(verifyJwt);

const photoUpload = upload.fields([{ name: "profilePhoto", maxCount: 1 }]);

router.post("/", photoUpload, createProfile);
router.patch("/me", editProfile);
router.patch("/me/photo", photoUpload, updateProfilePhoto);

export default router;