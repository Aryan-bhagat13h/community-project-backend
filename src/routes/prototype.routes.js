import { Router } from "express";
import {
  createPrototype,
  updatePrototype,
  deletePrototype,
  getPrototype,
  getMyPrototypes,
  getProjectPrototypes,
  uploadPrototypeAttachment,
  deletePrototypeAttachment,
  submitPrototype,
  getPrototypeStatus,
  getPrototypeFeedback,
  resubmitPrototype,
  getPrototypeVersionHistory,
} from "../controllers/prototype.controllers.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictedToStudent } from "../middlewares/role.middleware.js";
import { uploadAttachments } from "../middlewares/attachmentUpload.middleware.js";

const router = Router();
router.use(verifyJWT);


router.post("/projects/:projectId/prototypes", restrictedToStudent, createPrototype);
router.get("/projects/:projectId/prototypes", getProjectPrototypes);

router.get("/prototypes/my", restrictedToStudent, getMyPrototypes);

router.get("/prototypes/:prototypeId", getPrototype);
router.patch("/prototypes/:prototypeId", restrictedToStudent, updatePrototype);
router.delete("/prototypes/:prototypeId", restrictedToStudent, deletePrototype);

router.post(
  "/prototypes/:prototypeId/attachments",
  restrictedToStudent,
  uploadAttachments.array("files", 5),
  uploadPrototypeAttachment
);
router.delete(
  "/prototypes/:prototypeId/attachments/:attachmentId",
  restrictedToStudent,
  deletePrototypeAttachment
);

router.post("/prototypes/:prototypeId/submit", restrictedToStudent, submitPrototype);
router.post("/prototypes/:prototypeId/resubmit", restrictedToStudent, resubmitPrototype);

router.get("/prototypes/:prototypeId/status", getPrototypeStatus);
router.get("/prototypes/:prototypeId/feedback", getPrototypeFeedback);
router.get("/prototypes/:prototypeId/history", getPrototypeVersionHistory);

export default router;