import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Prototype } from "../models/prototype.models.js";
import { PrototypeReview } from "../models/prototype-review.models.js";
import { Profile } from "../models/profile.models.js";
import { FacultyProfile } from "../models/facultyProfile.models.js";

const REVIEWABLE = ["submitted", "under_review"];
const VISIBLE_STATUSES = ["submitted", "under_review", "changes_requested", "approved", "rejected"];
const SCORE_KEYS = ["innovation", "technicalQuality", "completeness", "documentation", "testing"];
const MAX_TEXT = 2000;

const COMPARE_TEXT = [
  "title", "description", "type", "testingSummary", "testingResults",
  "demoUrl", "repositoryUrl", "readmeUrl", "architectureUrl", "demoVideo",
];
const COMPARE_LISTS = ["technologies", "completedFeatures", "partiallyCompletedFeatures", "plannedFeatures"];

const requireUser = (req) => {
  if (!req.user?._id) throw new ApiError(401, "Unauthorized access");
};

const assertId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${label}`);
};

const toStringList = (v) => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.map((i) => String(i).trim()).filter(Boolean);
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const paginationOf = (page, limit, total) => ({
  page,
  limit,
  total,
  pages: Math.ceil(total / limit),
});

const cleanText = (value, label, { min = 0, max = MAX_TEXT } = {}) => {
  const text = value === undefined || value === null ? "" : String(value).trim();
  if (min > 0 && text.length < min) {
    throw new ApiError(400, `${label} is required (at least ${min} characters)`);
  }
  if (text.length > max) {
    throw new ApiError(400, `${label} cannot exceed ${max} characters`);
  }
  return text;
};

const parseScores = (input) => {
  if (input === undefined) return undefined;
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ApiError(400, "scores must be an object, e.g. { innovation: 4, testing: 3 }");
  }
  const out = {};
  for (const [key, value] of Object.entries(input)) {
    if (!SCORE_KEYS.includes(key)) {
      throw new ApiError(400, `Unknown score "${key}". Allowed: ${SCORE_KEYS.join(", ")}`);
    }
    const n = Number(value);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      throw new ApiError(400, `Score "${key}" must be a whole number from 1 to 5`);
    }
    out[key] = n;
  }
  return out;
};

const computeOverall = (review) => {
  const values = SCORE_KEYS.map((k) => review.get(`scores.${k}`)).filter((v) => typeof v === "number");
  if (values.length === 0) return undefined;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
};

const composeFeedback = (feedback, changes) => {
  if (changes.length === 0) return feedback;
  return `${feedback}\n\nRequested changes:\n${changes.map((c) => `- ${c}`).join("\n")}`;
};

const currentRound = (prototype) =>
  Math.max(prototype.statusHistory.filter((h) => h.status === "submitted").length, 1);

const getMentoredTeamIds = async (userId) => {
  const profile = await Profile.findOne({
    user: userId,
    roleProfileModel: "FacultyProfile",
  }).select("roleProfile");
  if (!profile?.roleProfile) return [];

  const faculty = await FacultyProfile.findOne({
    _id: profile.roleProfile,
    verificationStatus: "verified",
    isRequested: true,
    isRequestAccepted: true,
  }).select("requestedBy");

  return faculty?.requestedBy ? [faculty.requestedBy] : [];
};

const loadAssignedPrototype = async (req) => {
  requireUser(req);
  const { prototypeId } = req.params;
  assertId(prototypeId, "prototype id");

  const prototype = await Prototype.findById(prototypeId);
  if (!prototype) throw new ApiError(404, "Prototype not found");

  const teamIds = await getMentoredTeamIds(req.user._id);
  if (!teamIds.some((id) => id.equals(prototype.team))) {
    throw new ApiError(403, "This prototype does not belong to a team you mentor");
  }
  if (prototype.reviewStatus === "draft") {
    throw new ApiError(403, "This prototype has not been submitted yet");
  }
  return prototype;
};

const ensureUnderReview = async (prototype, userId) => {
  if (prototype.reviewStatus === "under_review") return;
  if (prototype.reviewStatus !== "submitted") {
    throw new ApiError(409, `This prototype is already ${prototype.reviewStatus.replace(/_/g, " ")}`);
  }

  const moved = await Prototype.findOneAndUpdate(
    { _id: prototype._id, reviewStatus: "submitted" },
    { $set: { reviewStatus: "under_review", reviewer: userId } }
  );
  if (!moved) {
    throw new ApiError(409, "Prototype status changed. Please reload and try again");
  }
  prototype.reviewStatus = "under_review";
  prototype.reviewer = userId;
};

const getOrCreateReview = async (prototype, reviewerId) => {
  const round = currentRound(prototype);
  const existing = await PrototypeReview.findOne({ prototype: prototype._id, round });
  if (existing) return existing;

  try {
    return await PrototypeReview.create({
      prototype: prototype._id,
      project: prototype.project,
      team: prototype.team,
      version: prototype.version,
      round,
      reviewer: reviewerId,
    });
  } catch (err) {
    if (err.code === 11000) {
      return PrototypeReview.findOne({ prototype: prototype._id, round }); 
    }
    throw err;
  }
};

const recordDecision = async (prototype, req, decision, feedback, requestedChanges = []) => {
  if (!REVIEWABLE.includes(prototype.reviewStatus)) {
    throw new ApiError(409, `This prototype is already ${prototype.reviewStatus.replace(/_/g, " ")}`);
  }

  const now = new Date();
  const set = { reviewStatus: decision, reviewer: req.user._id, reviewedAt: now };
  const update = feedback
    ? { $set: { ...set, reviewFeedback: feedback } }
    : { $set: set, $unset: { reviewFeedback: "" } };

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, reviewStatus: { $in: REVIEWABLE } },
    update,
    { new: true }
  );
  if (!updated) {
    throw new ApiError(409, "This prototype was already reviewed or changed. Please reload");
  }

  const reviewSet = { status: "completed", decision, decidedAt: now, reviewer: req.user._id };
  if (feedback) reviewSet.feedback = feedback;
  if (requestedChanges.length) reviewSet.requestedChanges = requestedChanges;

  const review = await PrototypeReview.findOneAndUpdate(
    { prototype: updated._id, round: currentRound(updated) },
    {
      $set: reviewSet,
      $setOnInsert: { project: updated.project, team: updated.team, version: updated.version },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { updated, review };
};

const decisionPayload = ({ updated, review }) => ({
  prototype: {
    _id: updated._id,
    version: updated.version,
    reviewStatus: updated.reviewStatus,
    reviewedAt: updated.reviewedAt,
    reviewFeedback: updated.reviewFeedback || null,
  },
  review,
});


const getAssignedPrototypes = asyncHandler(async (req, res) => {
  requireUser(req);

  const teamIds = await getMentoredTeamIds(req.user._id);
  const { page, limit, skip } = parsePagination(req.query);

  if (teamIds.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { prototypes: [], pagination: paginationOf(page, limit, 0) },
        "You are not mentoring any team yet"
      )
    );
  }

  const filter = { team: { $in: teamIds }, reviewStatus: { $in: VISIBLE_STATUSES } };

  if (req.query.status) {
    const status = String(req.query.status);
    if (!VISIBLE_STATUSES.includes(status)) throw new ApiError(400, "Invalid status filter");
    filter.reviewStatus = status;
  }

  const [prototypes, total] = await Promise.all([
    Prototype.find(filter)
      .select("title version type reviewStatus project team submittedBy submittedAt reviewedAt updatedAt")
      .populate("project", "title name")
      .populate("team", "name")
      .populate("submittedBy", "fullname username")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Prototype.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { prototypes, pagination: paginationOf(page, limit, total) },
      "Assigned prototypes fetched successfully"
    )
  );
});

const getPrototypeEvaluationQueue = asyncHandler(async (req, res) => {
  requireUser(req);

  const teamIds = await getMentoredTeamIds(req.user._id);
  const { page, limit, skip } = parsePagination(req.query);

  if (teamIds.length === 0) {
    return res.status(200).json(
      new ApiResponse(
        200,
        { queue: [], pagination: paginationOf(page, limit, 0) },
        "You are not mentoring any team yet"
      )
    );
  }

  const filter = { team: { $in: teamIds }, reviewStatus: { $in: REVIEWABLE } };

  if (req.query.status) {
    const status = String(req.query.status);
    if (!REVIEWABLE.includes(status)) {
      throw new ApiError(400, `status must be one of: ${REVIEWABLE.join(", ")}`);
    }
    filter.reviewStatus = status;
  }

  const [items, total] = await Promise.all([
    Prototype.find(filter)
      .select("title version type reviewStatus project team submittedAt statusHistory")
      .populate("project", "title name")
      .populate("team", "name")
      .sort({ submittedAt: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Prototype.countDocuments(filter),
  ]);

  const now = Date.now();
  const queue = items.map(({ statusHistory = [], ...p }) => {
    const submissions = statusHistory.filter((h) => h.status === "submitted").length;
    return {
      ...p,
      round: Math.max(submissions, 1),
      isResubmission: submissions > 1,
      waitingDays: p.submittedAt ? Math.floor((now - new Date(p.submittedAt)) / 86400000) : null,
    };
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { queue, pagination: paginationOf(page, limit, total) },
      queue.length ? "Evaluation queue fetched successfully" : "No prototypes waiting for review"
    )
  );
});

const getPrototypeDetails = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);

  await prototype.populate([
    { path: "project", select: "title name" },
    { path: "team", select: "name leader teamMembers" },
    { path: "submittedBy", select: "fullname username email" },
    { path: "reviewer", select: "fullname username" },
  ]);

  const round = currentRound(prototype);
  const currentReview = await PrototypeReview.findOne({ prototype: prototype._id, round }).lean();

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...prototype.toObject(),
        round,
        isResubmission: round > 1,
        currentReview, // null until the first evaluation/comment is saved
      },
      "Prototype details fetched successfully"
    )
  );
});


const reviewPrototype = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);

  if (!REVIEWABLE.includes(prototype.reviewStatus)) {
    throw new ApiError(409, `This prototype is already ${prototype.reviewStatus.replace(/_/g, " ")}`);
  }

  const scores = parseScores(req.body.scores);
  const strengths = req.body.strengths !== undefined ? toStringList(req.body.strengths) : undefined;
  const weaknesses = req.body.weaknesses !== undefined ? toStringList(req.body.weaknesses) : undefined;
  const summary = req.body.summary !== undefined ? cleanText(req.body.summary, "Summary") : undefined;

  if (!scores && strengths === undefined && weaknesses === undefined && summary === undefined) {
    throw new ApiError(400, "Provide at least one of: scores, strengths, weaknesses, summary");
  }

  await ensureUnderReview(prototype, req.user._id);

  const review = await getOrCreateReview(prototype, req.user._id);
  if (review.status === "completed") {
    throw new ApiError(409, "This review round is already completed");
  }

  if (scores) {
    for (const [key, value] of Object.entries(scores)) review.set(`scores.${key}`, value);
  }
  if (strengths !== undefined) review.strengths = strengths;
  if (weaknesses !== undefined) review.weaknesses = weaknesses;
  if (summary !== undefined) review.summary = summary;

  review.reviewer = req.user._id;
  review.overallScore = computeOverall(review);
  await review.save();

  return res
    .status(200)
    .json(new ApiResponse(200, { reviewStatus: "under_review", review }, "Review saved successfully"));
});

const approvePrototype = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);
  const feedback = cleanText(req.body.feedback, "Feedback");

  const result = await recordDecision(prototype, req, "approved", feedback);

  return res
    .status(200)
    .json(new ApiResponse(200, decisionPayload(result), "Prototype approved successfully"));
});

const requestPrototypeChanges = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);

  const feedback = cleanText(req.body.feedback, "Feedback", { min: 10 });
  const requestedChanges = toStringList(req.body.requestedChanges);
  if (requestedChanges.length > 10) {
    throw new ApiError(400, "At most 10 requested changes are allowed");
  }
  if (requestedChanges.some((c) => c.length > 300)) {
    throw new ApiError(400, "Each requested change must be at most 300 characters");
  }

  const fullFeedback = composeFeedback(feedback, requestedChanges);
  if (fullFeedback.length > MAX_TEXT) {
    throw new ApiError(400, `Feedback with requested changes cannot exceed ${MAX_TEXT} characters`);
  }

  const result = await recordDecision(prototype, req, "changes_requested", fullFeedback, requestedChanges);

  return res
    .status(200)
    .json(new ApiResponse(200, decisionPayload(result), "Changes requested successfully"));
});

const rejectPrototype = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);
  const reason = cleanText(req.body.reason ?? req.body.feedback, "Reason", { min: 10 });

  const result = await recordDecision(prototype, req, "rejected", reason);

  return res
    .status(200)
    .json(new ApiResponse(200, decisionPayload(result), "Prototype rejected"));
});

const addPrototypeReviewComments = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);

  if (!REVIEWABLE.includes(prototype.reviewStatus)) {
    throw new ApiError(409, `Comments can only be added while a prototype is under review`);
  }

  const text = cleanText(req.body.text, "Comment", { min: 1, max: 1000 });
  const section = req.body.section ? cleanText(req.body.section, "Section", { max: 50 }) : undefined;
  const visibleToTeam = req.body.visibleToTeam === undefined ? true : req.body.visibleToTeam === true || req.body.visibleToTeam === "true";

  await ensureUnderReview(prototype, req.user._id);

  const review = await getOrCreateReview(prototype, req.user._id);
  if (review.status === "completed") {
    throw new ApiError(409, "This review round is already completed");
  }

  review.comments.push({ author: req.user._id, text, section, visibleToTeam });
  await review.save(); // schema enforces the 50-comment limit

  const added = review.comments[review.comments.length - 1];

  return res
    .status(201)
    .json(
      new ApiResponse(
        201,
        { comment: added, totalComments: review.comments.length },
        "Comment added successfully"
      )
    );
});

const getPrototypeReviewHistory = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);

  const scope = String(req.query.scope || "prototype");
  if (!["prototype", "project"].includes(scope)) {
    throw new ApiError(400, 'scope must be "prototype" or "project"');
  }

  const filter =
    scope === "project" ? { project: prototype.project } : { prototype: prototype._id };

  const reviews = await PrototypeReview.find(filter)
    .sort({ version: 1, round: 1 })
    .populate("reviewer", "fullname username")
    .populate("comments.author", "fullname username")
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, { scope, count: reviews.length, reviews }, "Review history fetched successfully"));
});

const itemKey = (i) => i.publicId || i.url;

const diffFiles = (older = [], newer = []) => {
  const oldKeys = new Set(older.map(itemKey));
  const newKeys = new Set(newer.map(itemKey));
  const brief = (i) => ({ name: i.name || null, kind: i.kind || "screenshot", url: i.url });
  return {
    added: newer.filter((i) => !oldKeys.has(itemKey(i))).map(brief),
    removed: older.filter((i) => !newKeys.has(itemKey(i))).map(brief),
  };
};

const diffPrototypes = (older, newer) => {
  const changes = {};

  for (const f of COMPARE_TEXT) {
    const from = older[f] ?? null;
    const to = newer[f] ?? null;
    if (from !== to) changes[f] = { from, to };
  }

  for (const f of COMPARE_LISTS) {
    const a = older[f] || [];
    const b = newer[f] || [];
    const added = b.filter((x) => !a.includes(x));
    const removed = a.filter((x) => !b.includes(x));
    if (added.length || removed.length) changes[f] = { added, removed };
  }

  for (const f of ["screenshots", "attachments"]) {
    const diff = diffFiles(older[f], newer[f]);
    if (diff.added.length || diff.removed.length) changes[f] = diff;
  }

  const all = [...COMPARE_TEXT, ...COMPARE_LISTS, "screenshots", "attachments"];
  return { changes, unchanged: all.filter((f) => !(f in changes)) };
};

const comparePrototypeVersions = asyncHandler(async (req, res) => {
  const prototype = await loadAssignedPrototype(req);

  let older;
  if (req.query.with !== undefined) {
    const v = Number(req.query.with);
    if (!Number.isInteger(v) || v < 1) throw new ApiError(400, "with must be a version number");
    if (v >= prototype.version) throw new ApiError(400, "with must be an earlier version");

    older = await Prototype.findOne({
      project: prototype.project,
      version: v,
      reviewStatus: { $ne: "draft" },
    });
  } else {
    older = await Prototype.findOne({
      project: prototype.project,
      version: { $lt: prototype.version },
      reviewStatus: { $ne: "draft" },
    }).sort({ version: -1 });
  }

  if (!older) throw new ApiError(404, "No earlier submitted version to compare with");

  const previousReview = await PrototypeReview.findOne({ prototype: older._id })
    .sort({ round: -1 })
    .select("round decision feedback requestedChanges overallScore decidedAt")
    .lean();

  const { changes, unchanged } = diffPrototypes(older.toObject(), prototype.toObject());

  const meta = (p) => ({
    _id: p._id,
    version: p.version,
    reviewStatus: p.reviewStatus,
    submittedAt: p.submittedAt || null,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        from: meta(older),
        to: meta(prototype),
        previousReview,
        changes,
        unchanged,
        summary: `${Object.keys(changes).length} field(s) changed between v${older.version} and v${prototype.version}`,
      },
      "Versions compared successfully"
    )
  );
});

export {
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
};