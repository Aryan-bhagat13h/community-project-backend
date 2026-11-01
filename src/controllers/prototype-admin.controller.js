import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Prototype } from "../models/prototype.models.js";
import { PrototypeReview } from "../models/prototype-review.models.js";
import { PrototypeAuditLog, AUDIT_ACTIONS } from "../models/prototype-auditlog.models.js";
import { Project } from "../models/project.models.js"
import { Team } from "../models/team.models.js";
import { User } from "../models/user.models.js";
import { Profile } from "../models/profile.models.js";
import { FacultyProfile } from "../models/facultyProfile.models.js";
import { AdminProfile } from "../models/adminProfile.models.js";
import { StudentProfile } from "../models/studentProfile.models.js"; 

const STATUSES = ["draft", "submitted", "under_review", "changes_requested", "approved", "rejected"];
const REVIEWABLE = ["submitted", "under_review"];
const ASSIGNABLE = ["submitted", "under_review", "changes_requested"];
const OPEN = ["draft", "submitted", "under_review", "changes_requested"];
const TYPES = ["software", "hardware", "research_model", "physical_product", "process", "other"];
const FLAG_REASONS = ["inappropriate", "misleading", "suspicious", "plagiarism", "other"];
const REMOVED_MODES = ["exclude", "include", "only"];
const SEARCH_BY = ["all", "title", "project", "student", "team"];
const SORT_FIELDS = ["createdAt", "updatedAt", "submittedAt", "version", "title"];

const RESTORE_ALLOWED = ["super_admin", "project_admin"];

const LIST_SELECT =
  "title version type reviewStatus project team submittedBy reviewer submittedAt reviewedAt isFlagged isRemoved createdAt updatedAt";

const assertId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${label}`);
};

const label = (s) => String(s).replace(/_/g, " ");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const toRegex = (s) => new RegExp(escapeRegex(s), "i");

const cleanText = (value, name, { min = 0, max = 2000 } = {}) => {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (min > 0 && text.length < min) {
    throw new ApiError(400, `${name} is required (at least ${min} characters)`);
  }
  if (text.length > max) {
    throw new ApiError(400, `${name} cannot exceed ${max} characters`);
  }
  return text;
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 20, 1), 100);
  return { page, limit, skip: (page - 1) * limit };
};

const paginationOf = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

const parseSort = (query, fallback) => {
  if (!query.sortBy) return fallback;
  const field = String(query.sortBy);
  if (!SORT_FIELDS.includes(field)) {
    throw new ApiError(400, `sortBy must be one of: ${SORT_FIELDS.join(", ")}`);
  }
  return { [field]: String(query.order) === "asc" ? 1 : -1 };
};

const parseDate = (value, name) => {
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(400, `${name} must be a valid date (YYYY-MM-DD)`);
  }
  return d;
};

const dateRange = (query) => {
  const range = {};
  if (query.from) range.$gte = parseDate(query.from, "from");
  if (query.to) {
    const to = parseDate(query.to, "to");
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(query.to))) to.setUTCHours(23, 59, 59, 999);
    range.$lte = to;
  }
  return Object.keys(range).length ? range : undefined;
};

const existingFields = (Model, fields) => fields.filter((f) => Model.schema.path(f));

const loadPrototype = async (req, { includeRemoved = false } = {}) => {
  const { prototypeId } = req.params;
  assertId(prototypeId, "prototype id");

  const query = Prototype.findById(prototypeId);
  if (includeRemoved) query.setOptions({ includeRemoved: true });

  const prototype = await query;
  if (!prototype) throw new ApiError(404, "Prototype not found");
  return prototype;
};

const logAction = async (req, prototype, action, { reason, details } = {}) => {
  try {
    await PrototypeAuditLog.create({
      prototype: prototype._id,
      project: prototype.project,
      prototypeTitle: prototype.title,
      prototypeVersion: prototype.version,
      actor: req.user._id,
      action,
      reason: reason || undefined,
      details,
      ip: req.ip,
    });
  } catch (err) {
    console.error("Failed to write prototype audit log:", err);
  }
};

const loadVerifiedFaculty = async (reviewerId) => {
  assertId(reviewerId, "reviewer id");

  const user = await User.findById(reviewerId).select("fullname username role");
  if (!user || user.role !== "faculty") {
    throw new ApiError(404, "Faculty member not found");
  }

  const profile = await Profile.findOne({
    user: user._id,
    roleProfileModel: "FacultyProfile",
  }).select("roleProfile");

  const verified =
    profile?.roleProfile &&
    (await FacultyProfile.exists({ _id: profile.roleProfile, verificationStatus: "verified" }));
  if (!verified) {
    throw new ApiError(400, "This faculty member is not verified");
  }
  return user;
};

const getAdminType = async (userId) => {
  const profile = await Profile.findOne({
    user: userId,
    roleProfileModel: "AdminProfile",
  }).select("roleProfile");
  if (!profile?.roleProfile) return "moderator";

  const admin = await AdminProfile.findById(profile.roleProfile).select("adminType");
  return admin?.adminType || "moderator";
};

const transferOpenReview = (prototypeId, newReviewerId) =>
  PrototypeReview.updateMany(
    { prototype: prototypeId, status: "in_progress" },
    { $set: { reviewer: newReviewerId } }
  );

const parseRemovedMode = (query) => {
  const mode = String(query.removed || "exclude");
  if (!REMOVED_MODES.includes(mode)) {
    throw new ApiError(400, `removed must be one of: ${REMOVED_MODES.join(", ")}`);
  }
  return mode;
};

const teamIdsByInstitution = async (institution) => {
  const rx = toRegex(institution);
  const students = await StudentProfile.find({ college: rx }).select("_id").limit(2000).lean();
  if (!students.length) return [];

  const profiles = await Profile.find({
    roleProfileModel: "StudentProfile",
    roleProfile: { $in: students.map((s) => s._id) },
  })
    .select("user")
    .limit(2000)
    .lean();
  const userIds = profiles.map((p) => p.user);
  if (!userIds.length) return [];

  const teams = await Team.find({
    $or: [{ teamMembers: { $in: userIds } }, { leader: { $in: userIds } }],
  })
    .select("_id")
    .limit(2000)
    .lean();
  return teams.map((t) => t._id);
};

const projectIdsByText = async (rx) => {
  const fields = existingFields(Project, ["title", "name"]);
  if (!fields.length) return [];
  const docs = await Project.find({ $or: fields.map((f) => ({ [f]: rx })) })
    .select("_id")
    .limit(500)
    .lean();
  return docs.map((d) => d._id);
};

const teamIdsByName = async (rx) => {
  const docs = await Team.find({ name: rx }).select("_id").limit(500).lean();
  return docs.map((d) => d._id);
};

const studentMatches = async (rx) => {
  const users = await User.find({
    role: "student",
    $or: [{ fullname: rx }, { username: rx }, { email: rx }],
  })
    .select("_id")
    .limit(500)
    .lean();
  if (!users.length) return { userIds: [], teamIds: [] };

  const userIds = users.map((u) => u._id);
  const teams = await Team.find({
    $or: [{ teamMembers: { $in: userIds } }, { leader: { $in: userIds } }],
  })
    .select("_id")
    .limit(500)
    .lean();
  return { userIds, teamIds: teams.map((t) => t._id) };
};

const buildFilter = async (req) => {
  const q = req.query;
  const filter = {};

  if (q.status) {
    const status = String(q.status);
    if (!STATUSES.includes(status)) throw new ApiError(400, "Invalid status filter");
    filter.reviewStatus = status;
  }

  if (q.type) {
    const type = String(q.type).toLowerCase();
    if (!TYPES.includes(type)) throw new ApiError(400, `type must be one of: ${TYPES.join(", ")}`);
    filter.type = type;
  }

  if (q.flagged !== undefined) {
    filter.isFlagged = String(q.flagged) === "true" ? true : { $ne: true };
  }

  if (q.reviewer) {
    assertId(String(q.reviewer), "reviewer id");
    filter.reviewer = String(q.reviewer);
  } else if (String(q.unassigned) === "true") {
    filter.reviewer = null;
  }

  if (q.project) {
    assertId(String(q.project), "project id");
    filter.project = String(q.project);
  }
  if (q.team) {
    assertId(String(q.team), "team id");
    filter.team = String(q.team);
  }

  const created = dateRange(q);
  if (created) filter.createdAt = created;

  const removedMode = parseRemovedMode(q);
  if (removedMode === "only") filter.isRemoved = true;

  const and = [];

  if (q.institution) {
    const institution = cleanText(q.institution, "Institution", { min: 2, max: 100 });
    and.push({ team: { $in: await teamIdsByInstitution(institution) } });
  }

  if (q.category) {
    if (!Project.schema.path("category")) {
      throw new ApiError(400, "Projects have no category field, so category filtering is unavailable");
    }
    const projects = await Project.find({ category: String(q.category) })
      .select("_id")
      .limit(2000)
      .lean();
    and.push({ project: { $in: projects.map((p) => p._id) } });
  }

  if (and.length) filter.$and = and;

  return { filter, includeRemoved: removedMode !== "exclude" };
};

const listPrototypes = async (req, res, { filter, includeRemoved, defaultSort, message, extraSelect = "", decorate }) => {
  const { page, limit, skip } = parsePagination(req.query);
  const sort = parseSort(req.query, defaultSort);

  const find = Prototype.find(filter)
    .select(`${LIST_SELECT} ${extraSelect}`)
    .populate("project", "title name")
    .populate("team", "name")
    .populate("submittedBy", "fullname username")
    .populate("reviewer", "fullname username")
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();
  const count = Prototype.countDocuments(filter);

  if (includeRemoved) {
    find.setOptions({ includeRemoved: true });
    count.setOptions({ includeRemoved: true });
  }

  const [items, total] = await Promise.all([find, count]);
  const prototypes = decorate ? items.map(decorate) : items;

  return res
    .status(200)
    .json(new ApiResponse(200, { prototypes, pagination: paginationOf(page, limit, total) }, message));
};

const getAllPrototypes = asyncHandler(async (req, res) => {
  const mode = parseRemovedMode(req.query);
  const filter = mode === "only" ? { isRemoved: true } : {};

  return listPrototypes(req, res, {
    filter,
    includeRemoved: mode !== "exclude",
    defaultSort: { createdAt: -1 },
    message: "Prototypes fetched successfully",
  });
});


const filterPrototypes = asyncHandler(async (req, res) => {
  const { filter, includeRemoved } = await buildFilter(req);

  return listPrototypes(req, res, {
    filter,
    includeRemoved,
    defaultSort: { createdAt: -1 },
    message: "Filtered prototypes fetched successfully",
  });
});

const searchPrototypes = asyncHandler(async (req, res) => {
  const term = cleanText(req.query.q, "Search term", { min: 2, max: 100 });
  const by = String(req.query.by || "all");
  if (!SEARCH_BY.includes(by)) {
    throw new ApiError(400, `by must be one of: ${SEARCH_BY.join(", ")}`);
  }

  const rx = toRegex(term);
  const clauses = [];

  if (by === "all" || by === "title") clauses.push({ title: rx });

  if (by === "all" || by === "project") {
    const ids = await projectIdsByText(rx);
    if (ids.length) clauses.push({ project: { $in: ids } });
  }

  if (by === "all" || by === "student") {
    const { userIds, teamIds } = await studentMatches(rx);
    if (userIds.length) clauses.push({ submittedBy: { $in: userIds } });
    if (teamIds.length) clauses.push({ team: { $in: teamIds } });
  }

  if (by === "all" || by === "team") {
    const ids = await teamIdsByName(rx);
    if (ids.length) clauses.push({ team: { $in: ids } });
  }

  const { filter, includeRemoved } = await buildFilter(req);
  // No clause matched anything return an empty page instead of everything
  filter.$or = clauses.length ? clauses : [{ _id: { $in: [] } }];

  return listPrototypes(req, res, {
    filter,
    includeRemoved,
    defaultSort: { updatedAt: -1 },
    message: `Search results for "${term}"`,
  });
});


const getPendingPrototypes = asyncHandler(async (req, res) => {
  const { filter, includeRemoved } = await buildFilter(req);

  if (!filter.reviewStatus) {
    filter.reviewStatus = { $in: REVIEWABLE };
  } else if (!REVIEWABLE.includes(filter.reviewStatus)) {
    throw new ApiError(400, `status must be one of: ${REVIEWABLE.join(", ")}`);
  }

  const overdueDays = Math.min(Math.max(parseInt(req.query.overdueDays, 10) || 7, 1), 90);
  const now = Date.now();

  return listPrototypes(req, res, {
    filter,
    includeRemoved,
    defaultSort: { submittedAt: 1 },
    extraSelect: "statusHistory",
    message: "Pending prototypes fetched successfully",
    decorate: ({ statusHistory = [], ...p }) => {
      const submissions = statusHistory.filter((h) => h.status === "submitted").length;
      const waitingDays = p.submittedAt
        ? Math.floor((now - new Date(p.submittedAt)) / 86400000)
        : null;
      return {
        ...p,
        round: Math.max(submissions, 1),
        isResubmission: submissions > 1,
        waitingDays,
        isOverdue: waitingDays !== null && waitingDays >= overdueDays,
        hasReviewer: Boolean(p.reviewer),
      };
    },
  });
});

const getPrototypeDetails = asyncHandler(async (req, res) => {
  const { prototypeId } = req.params;
  assertId(prototypeId, "prototype id");

  const prototype = await Prototype.findById(prototypeId)
    .setOptions({ includeRemoved: true })
    .populate("project")
    .populate({
      path: "team",
      select: "name maxMembers leader teamMembers",
      populate: [
        { path: "leader", select: "fullname username email" },
        { path: "teamMembers", select: "fullname username email" },
      ],
    })
    .populate("submittedBy", "fullname username email")
    .populate("reviewer", "fullname username email")
    .populate("reviewerAssignedBy", "fullname username")
    .populate("flag.flaggedBy", "fullname username")
    .populate("removal.removedBy", "fullname username");

  if (!prototype) throw new ApiError(404, "Prototype not found");

  const [reviews, recentAudit] = await Promise.all([
    PrototypeReview.find({ prototype: prototype._id })
      .sort({ round: 1 })
      .populate("reviewer", "fullname username")
      .lean(),
    PrototypeAuditLog.find({ prototype: prototype._id })
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("actor", "fullname username")
      .lean(),
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, { prototype, reviews, recentAudit }, "Prototype details fetched successfully"));
});

const assignPrototypeReviewer = asyncHandler(async (req, res) => {
  const prototype = await loadPrototype(req);

  if (!ASSIGNABLE.includes(prototype.reviewStatus)) {
    throw new ApiError(409, `A reviewer cannot be assigned while the prototype is ${label(prototype.reviewStatus)}`);
  }
  if (prototype.reviewerAssignedBy) {
    throw new ApiError(409, "A reviewer was already assigned by an admin. Use the reassign endpoint to change it");
  }

  const faculty = await loadVerifiedFaculty(req.body.reviewerId);
  const note = cleanText(req.body.note, "Note", { max: 500 });
  const now = new Date();

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, reviewStatus: { $in: ASSIGNABLE }, reviewerAssignedBy: null },
    { $set: { reviewer: faculty._id, reviewerAssignedBy: req.user._id, reviewerAssignedAt: now } },
    { new: true }
  ).select("title version project reviewStatus reviewer reviewerAssignedAt");

  if (!updated) {
    throw new ApiError(409, "The prototype changed while assigning. Please reload and try again");
  }

  await transferOpenReview(updated._id, faculty._id);
  await logAction(req, updated, "assign_reviewer", {
    reason: note,
    details: {
      from: prototype.reviewer || null,
      to: { _id: faculty._id, fullname: faculty.fullname },
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updated, `Reviewer assigned: ${faculty.fullname}`));
});

const reassignPrototypeReviewer = asyncHandler(async (req, res) => {
  const prototype = await loadPrototype(req);

  if (!ASSIGNABLE.includes(prototype.reviewStatus)) {
    throw new ApiError(409, `A review cannot be transferred while the prototype is ${label(prototype.reviewStatus)}`);
  }
  if (!prototype.reviewer) {
    throw new ApiError(409, "This prototype has no reviewer yet. Use the assign endpoint instead");
  }

  const reason = cleanText(req.body.reason, "Reason", { min: 5, max: 500 });
  const faculty = await loadVerifiedFaculty(req.body.reviewerId);

  if (prototype.reviewer.equals(faculty._id)) {
    throw new ApiError(400, "This faculty member is already the reviewer");
  }

  const previousReviewer = prototype.reviewer;
  const now = new Date();

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, reviewStatus: { $in: ASSIGNABLE }, reviewer: previousReviewer },
    { $set: { reviewer: faculty._id, reviewerAssignedBy: req.user._id, reviewerAssignedAt: now } },
    { new: true }
  ).select("title version project reviewStatus reviewer reviewerAssignedAt");

  if (!updated) {
    throw new ApiError(409, "The prototype changed while reassigning. Please reload and try again");
  }

  await transferOpenReview(updated._id, faculty._id);
  await logAction(req, updated, "reassign_reviewer", {
    reason,
    details: {
      from: previousReviewer,
      to: { _id: faculty._id, fullname: faculty.fullname },
    },
  });

  return res
    .status(200)
    .json(new ApiResponse(200, updated, `Review transferred to ${faculty.fullname}`));
});

const flagPrototype = asyncHandler(async (req, res) => {
  const prototype = await loadPrototype(req);

  const reason = String(req.body.reason || "").toLowerCase();
  if (!FLAG_REASONS.includes(reason)) {
    throw new ApiError(400, `reason must be one of: ${FLAG_REASONS.join(", ")}`);
  }
  const note = cleanText(req.body.note, "Note", { min: 10, max: 1000 });

  if (prototype.isFlagged) {
    throw new ApiError(409, "This prototype is already flagged");
  }

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, isFlagged: { $ne: true } },
    { $set: { isFlagged: true, flag: { reason, note, flaggedBy: req.user._id, flaggedAt: new Date() } } },
    { new: true }
  ).select("title version project reviewStatus isFlagged flag");

  if (!updated) throw new ApiError(409, "This prototype was just flagged by someone else");

  await logAction(req, updated, "flag", { reason: note, details: { flagReason: reason } });

  return res.status(200).json(new ApiResponse(200, updated, "Prototype flagged"));
});

const unflagPrototype = asyncHandler(async (req, res) => {
  const prototype = await loadPrototype(req);

  if (!prototype.isFlagged) {
    throw new ApiError(409, "This prototype is not flagged");
  }
  const note = cleanText(req.body.note, "Note", { min: 5, max: 1000 });
  const previousFlag = prototype.flag ? prototype.flag.toObject() : null;

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, isFlagged: true },
    { $set: { isFlagged: false }, $unset: { flag: "" } },
    { new: true }
  ).select("title version project reviewStatus isFlagged");

  if (!updated) throw new ApiError(409, "This prototype was just unflagged by someone else");

  await logAction(req, updated, "unflag", { reason: note, details: { previousFlag } });

  return res.status(200).json(new ApiResponse(200, updated, "Flag cleared"));
});


const removePrototype = asyncHandler(async (req, res) => {
  const prototype = await loadPrototype(req, { includeRemoved: true });

  if (prototype.isRemoved) {
    throw new ApiError(409, "This prototype is already removed");
  }
  const reason = cleanText(req.body.reason, "Reason", { min: 10, max: 1000 });

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id },
    { $set: { isRemoved: true, removal: { reason, removedBy: req.user._id, removedAt: new Date() } } },
    { new: true }
  ).select("title version project reviewStatus isRemoved removal");

  if (!updated) throw new ApiError(409, "This prototype was just removed by someone else");

  await logAction(req, updated, "remove", { reason, details: { statusAtRemoval: prototype.reviewStatus } });

  return res.status(200).json(new ApiResponse(200, updated, "Prototype removed"));
});

const restorePrototype = asyncHandler(async (req, res) => {
  const prototype = await loadPrototype(req, { includeRemoved: true });

  if (!prototype.isRemoved) {
    throw new ApiError(409, "This prototype is not removed");
  }
  const reason = cleanText(req.body.reason, "Reason", { min: 5, max: 1000 });

  // Permission policy
  const adminType = await getAdminType(req.user._id);
  if (!RESTORE_ALLOWED.includes(adminType)) {
    throw new ApiError(403, "Your admin role is not permitted to restore prototypes");
  }
  if (prototype.removal?.removedBy) {
    const removerType = await getAdminType(prototype.removal.removedBy);
    if (removerType === "super_admin" && adminType !== "super_admin") {
      throw new ApiError(403, "Only a super admin can restore a removal made by a super admin");
    }
  }

  if (OPEN.includes(prototype.reviewStatus)) {
    const clash = await Prototype.exists({
      project: prototype.project,
      _id: { $ne: prototype._id },
      reviewStatus: { $in: OPEN },
    });
    if (clash) {
      throw new ApiError(409, "This project already has another unfinished prototype. Resolve it before restoring this one");
    }
  }

  const previousRemoval = prototype.removal ? prototype.removal.toObject() : null;

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, isRemoved: true },
    { $set: { isRemoved: false }, $unset: { removal: "" } },
    { new: true }
  )
    .setOptions({ includeRemoved: true })
    .select("title version project reviewStatus isRemoved");

  if (!updated) throw new ApiError(409, "This prototype was just restored by someone else");

  await logAction(req, updated, "restore", { reason, details: { previousRemoval } });

  return res.status(200).json(new ApiResponse(200, updated, "Prototype restored"));
});

const getPrototypeStatistics = asyncHandler(async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [result] = await Prototype.aggregate([
    { $match: { isRemoved: { $ne: true } } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$reviewStatus", count: { $sum: 1 } } }],
        byType: [{ $group: { _id: "$type", count: { $sum: 1 } } }],
        monthly: [
          { $match: { submittedAt: { $gte: since } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$submittedAt" } },
              submitted: { $sum: 1 },
              approved: { $sum: { $cond: [{ $eq: ["$reviewStatus", "approved"] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ["$reviewStatus", "rejected"] }, 1, 0] } },
              changesRequested: { $sum: { $cond: [{ $eq: ["$reviewStatus", "changes_requested"] }, 1, 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
        turnaround: [
          { $match: { reviewedAt: { $exists: true }, submittedAt: { $exists: true } } },
          {
            $group: {
              _id: null,
              avgMs: { $avg: { $subtract: ["$reviewedAt", "$submittedAt"] } },
              reviewed: { $sum: 1 },
            },
          },
        ],
        pending: [
          { $match: { reviewStatus: { $in: REVIEWABLE } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              unassigned: { $sum: { $cond: [{ $ifNull: ["$reviewer", false] }, 0, 1] } },
              oldestSubmittedAt: { $min: "$submittedAt" },
            },
          },
        ],
        flagged: [{ $match: { isFlagged: true } }, { $count: "count" }],
      },
    },
  ]);

  const removed = await Prototype.countDocuments({ isRemoved: true }).setOptions({ includeRemoved: true });

  const statusCounts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const r of result.byStatus) statusCounts[r._id] = r.count;

  const typeCounts = Object.fromEntries(TYPES.map((t) => [t, 0]));
  for (const r of result.byType) typeCounts[r._id] = r.count;

  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const decided = statusCounts.approved + statusCounts.rejected;
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

  const turnaround = result.turnaround[0];
  const pending = result.pending[0];

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totals: {
          all: total,
          submittedEver: total - statusCounts.draft,
          removed,
          flagged: result.flagged[0]?.count || 0,
        },
        byStatus: statusCounts,
        byType: typeCounts,
        outcomes: {
          approved: statusCounts.approved,
          rejected: statusCounts.rejected,
          changesRequested: statusCounts.changes_requested,
          approvalRatePercent: pct(statusCounts.approved, decided),
          rejectionRatePercent: pct(statusCounts.rejected, decided),
        },
        pending: {
          total: pending?.total || 0,
          unassigned: pending?.unassigned || 0,
          oldestSubmittedAt: pending?.oldestSubmittedAt || null,
        },
        reviewTurnaround: {
          reviewedCount: turnaround?.reviewed || 0,
          averageDays: turnaround ? Math.round((turnaround.avgMs / 86400000) * 10) / 10 : null,
        },
        monthly: result.monthly.map(({ _id, ...rest }) => ({ month: _id, ...rest })),
        monthsCovered: months,
      },
      "Prototype statistics fetched successfully"
    )
  );
});

const getPrototypeAuditHistory = asyncHandler(async (req, res) => {
  const filter = {};

  if (req.params.prototypeId) {
    assertId(req.params.prototypeId, "prototype id");
    filter.prototype = req.params.prototypeId;
  }

  if (req.query.action) {
    const action = String(req.query.action);
    if (!AUDIT_ACTIONS.includes(action)) {
      throw new ApiError(400, `action must be one of: ${AUDIT_ACTIONS.join(", ")}`);
    }
    filter.action = action;
  }

  if (req.query.actor) {
    assertId(String(req.query.actor), "actor id");
    filter.actor = String(req.query.actor);
  }

  const created = dateRange(req.query);
  if (created) filter.createdAt = created;

  const { page, limit, skip } = parsePagination(req.query);

  const [entries, total] = await Promise.all([
    PrototypeAuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("actor", "fullname username")
      .lean(),
    PrototypeAuditLog.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { entries, pagination: paginationOf(page, limit, total) },
      "Audit history fetched successfully"
    )
  );
});

export {
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
};