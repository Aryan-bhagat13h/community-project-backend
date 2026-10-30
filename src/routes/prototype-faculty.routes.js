import { Router } from "express";
import {
  getAssignedPrototypes,
  getPrototypeDetails,
  reviewPrototype,
  approvePrototype,
  requestPrototypeChanges,
  rejectPrototype,
  addPrototypeReviewComments,
  getPrototypeReviewHistory,
  comparePrototypeVersions,
  getPrototypeEvaluationQueue,
} from "../controllers/prototype-faculty.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictedToFaculty } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJWT, restrictedToFaculty);

router.get("/prototypes/assigned", getAssignedPrototypes);
router.get("/prototypes/queue", getPrototypeEvaluationQueue);

router.get("/prototypes/:prototypeId", getPrototypeDetails);

router.put("/prototypes/:prototypeId/review", reviewPrototype);
router.post("/prototypes/:prototypeId/comments", addPrototypeReviewComments);

router.post("/prototypes/:prototypeId/approve", approvePrototype);
router.post("/prototypes/:prototypeId/request-changes", requestPrototypeChanges);
router.post("/prototypes/:prototypeId/reject", rejectPrototype);

router.get("/prototypes/:prototypeId/reviews", getPrototypeReviewHistory);
router.get("/prototypes/:prototypeId/compare", comparePrototypeVersions);

export default router;