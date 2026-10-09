import {ApiError} from '../utils/api-error.js';
import {asyncHandler} from '../utils/async-handler.js';
import { ApiResponse } from '../utils/api-response.js';
import { Problem } from '../models/problem.models.js';
import { SavedProblem } from '../models/saved-problem.models.js';
const browseProblems = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const allowedValues = {
    severity: ["low", "moderate", "high", "critical"],
    urgency: ["low", "moderate", "urgent", "emergency"],
    locationType: [
      "household", "locality", "village", "town", "city",
      "district", "state", "regional", "national", "other",
    ],
  };

  const asString = (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const toList = (v) => {
    const s = asString(v);
    return s ? s.split(",").map((i) => i.trim()).filter(Boolean) : [];
  };

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);

  const filter = {
    verificationStatus: "verified",
    isDeleted: false,
    isRejected: { $ne: true },
  };

  for (const [field, allowed] of Object.entries(allowedValues)) {
    const list = toList(req.query[field]);
    if (list.length === 0) continue;

    const invalid = list.filter((v) => !allowed.includes(v));
    if (invalid.length > 0) {
      throw new ApiError(400, `Invalid ${field}: ${invalid.join(", ")}`);
    }
    filter[field] = { $in: list };
  }

  const skills = toList(req.query.skills);
  if (skills.length > 0) {
    filter.skills = {
      $in: skills.map((s) => new RegExp(`^${escapeRegex(s)}$`, "i")),
    };
  }

  const search = asString(req.query.search);
  if (search) {
    const pattern = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  const sortableFields = ["createdAt", "approxNoPeopleAffected"];
  const sortBy = sortableFields.includes(req.query.sortBy) ? req.query.sortBy : "createdAt";
  const sortOrder = req.query.order === "asc" ? 1 : -1;

  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .select(
        "title description category subCategory location locationType severity urgency skills approxNoPeopleAffected affectedGroups problemPhoto reportedBy createdAt"
      )
      .populate("reportedBy", "username fullName")
      .sort({ [sortBy]: sortOrder, _id: -1 })
      .skip((page - 1) * limit)
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

const savedProblem = asyncHandler(async(req,res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access");
  }

  const {problemId} = req.params

  if(!mongoose.Types.ObjectId.isValid(problemId)){
    throw new ApiError(400, "Invalid problem id");
  }

  const problem = await Problem.findOne({
    _id: problemId,
    isDeleted: false,
    verificationStatus: "verified"
  });

   try {
    await SavedProblem.create({ user: req.user._id, problem: problem._id });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "Problem already saved");
    }
    throw err;
  }

  if(!savedProblem){
    throw new ApiError(404, "Problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, savedProblem, "Problem saved successfully"))
});

const unsaveProblem = asyncHandler(async(req, res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access");
  }

  const {problemId} = req.params;
  if(!mongoose.Types.ObjectId.isValid(problemId)){
    throw new ApiError(400, "Invalid problem Id");
  }

  const result =  await SavedProblem.deleteOne({user: req.user._id, proble: problemId});
  if(result.deletedCount === 0){
    throw new ApiError(404, "Saved problem not found");
  }

  return res
    .status(200)
    .json(200, {problemId}, "Unsave problem succesfully")
});

const getSavedProblems = asyncHandler(async(req,res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access");
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);

  const [saved, total] = await Promise.all([
    SavedProblem.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate({
        path: "problem",
        match: { isDeleted: false },
        select: "title description location locationType severity urgency skills problemPhoto reportedBy verificationStatus",
        populate: { path: "reportedBy", select: "username fullName" },
      })
      .lean(),
    SavedProblem.countDocuments({ user: req.user._id }),
  ]);

  const problems = saved
    .filter((s) => s.problem)
    .map((s) => ({ ...s.problem, savedAt: s.createdAt }));

  return res
  .status(200)
  .json(new ApiResponse(
      200,
      { problems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } },
      "Saved problems fetched successfully"
    ))
});

export {browseProblems, savedProblem, unsaveProblem}