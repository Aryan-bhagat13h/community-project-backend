import { Router } from "express";
import {
  getAllPrototypes,
  getPrototypeDetails,
  searchPrototypes,
  filterPrototypes,
  getPendingPrototypes,
  assignPrototypeReviewer,
  reassignPrototypeReviewer,
  flagPrototype,
  unflagPrototype,
  removePrototype,
  restorePrototype,
  getPrototypeStatistics,
  getPrototypeAuditHistory,
} from "../controllers/prototype-admin.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { restrictedToAdmin } from "../middlewares/role.middleware.js";

const router = Router();
router.use(verifyJWT, restrictedToAdmin);

router.get("/prototypes", getAllPrototypes);
router.get("/prototypes/search", searchPrototypes);
router.get("/prototypes/filter", filterPrototypes);
router.get("/prototypes/pending", getPendingPrototypes);
router.get("/prototypes/statistics", getPrototypeStatistics);
router.get("/audit", getPrototypeAuditHistory);

router.get("/prototypes/:prototypeId", getPrototypeDetails);
router.get("/prototypes/:prototypeId/audit", getPrototypeAuditHistory);

router.post("/prototypes/:prototypeId/assign-reviewer", assignPrototypeReviewer);
router.post("/prototypes/:prototypeId/reassign-reviewer", reassignPrototypeReviewer);

router.post("/prototypes/:prototypeId/flag", flagPrototype);
router.post("/prototypes/:prototypeId/unflag", unflagPrototype);
router.post("/prototypes/:prototypeId/remove", removePrototype);
router.post("/prototypes/:prototypeId/restore", restorePrototype);

export default router;