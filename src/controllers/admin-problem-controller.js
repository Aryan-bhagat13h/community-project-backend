import mongoose from "mongoose";
import { Problem } from "../models/problem.models.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";

const VERIFICATION_STATUSES = [
  "pending",
  "under_review",
  "verified",
  "rejected",
  "needs_revision",
];

const SORTABLE_FIELDS = ["createdAt", "updatedAt", "status", "verificationStatus"];

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parsePositiveInt = (value, fallback, max = Infinity) => {
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return fallback;
  return Math.min(n, max);
};

const queryString = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

const updateVerificationStatus = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }

  const status = queryString(req.body.verificationStatus);
  if (!status || !VERIFICATION_STATUSES.includes(status)) {
    throw new ApiError(
      400,
      `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}`
    );
  }

  const problem = await Problem.findById(problemId);
  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }

  problem.verificationStatus = status;
  await problem.save();

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Verification status updated successfully"));
});

const rejectProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid issue id");
  }

  const { rejectionReason } = req.body;

  if (typeof rejectionReason !== "string" || rejectionReason.trim() === "") {
    throw new ApiError(400, "Rejection reason is required");
  }

  const problem = await Problem.findOneAndUpdate(
    { _id: problemId, isDeleted: false },
    {
      $set: {
        verificationStatus: "rejected",
        rejectedAt: new Date(),
        rejectedBy: req.user._id,
        rejectionReason: rejectionReason.trim(),
        isRejected: true,
      },
    },
    { new: true }
  );

  if (!problem) {
    throw new ApiError(404, "Issue not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Issue rejected successfully"));
});


const getAllProblems = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const page = parsePositiveInt(req.query.page, 1);
  const limit = parsePositiveInt(req.query.limit, 20, 100);
  const skip = (page - 1) * limit;

  const filter = {};

  if (req.query.includeDeleted !== "true") {
    filter.isDeleted = false;
  }

  const status = queryString(req.query.status);
  if (status) filter.status = status;

  const verificationStatus = queryString(req.query.verificationStatus);
  if (verificationStatus) {
    if (!VERIFICATION_STATUSES.includes(verificationStatus)) {
      throw new ApiError(
        400,
        `verificationStatus must be one of: ${VERIFICATION_STATUSES.join(", ")}`
      );
    }
    filter.verificationStatus = verificationStatus;
  }

  if (req.query.isRejected === "true") filter.isRejected = true;
  if (req.query.isRejected === "false") filter.isRejected = { $ne: true };

  const search = queryString(req.query.search);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  const sortBy = SORTABLE_FIELDS.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
  const sortOrder = req.query.order === "asc" ? 1 : -1;

  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .sort({ [sortBy]: sortOrder, _id: -1 }) 
      .skip(skip)
      .limit(limit)
      .lean(),
    Problem.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        problems,
        pagination: {
          total,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
      "Problems fetched successfully"
    )
  );
});

const SEVERITY_LEVELS = ["low", "moderate", "high", "critical"];
const URGENCY_LEVELS = ["low", "moderate", "urgent", "emergency"];

const setSeverityUrgency = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }

  const { severity, urgency } = req.body ?? {};

  if (typeof severity !== "string" || !SEVERITY_LEVELS.includes(severity.trim())) {
    throw new ApiError(400, `severity must be one of: ${SEVERITY_LEVELS.join(", ")}`);
  }
  if (typeof urgency !== "string" || !URGENCY_LEVELS.includes(urgency.trim())) {
    throw new ApiError(400, `urgency must be one of: ${URGENCY_LEVELS.join(", ")}`);
  }

  const problem = await Problem.findOneAndUpdate(
    { _id: problemId, isDeleted: false },
    { $set: { severity: severity.trim(), urgency: urgency.trim() } },
    { new: true, runValidators: true }
  );

  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Severity and urgency set successfully"));
});

export { updateVerificationStatus, rejectProblem, getAllProblems, setSeverityUrgency };