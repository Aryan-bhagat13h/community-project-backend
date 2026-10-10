import mongoose from "mongoose";
import {ApiError} from '../utils/api-error.js';
import {asyncHandler} from '../utils/async-handler.js';
import { ApiResponse } from '../utils/api-response.js';
import { Problem } from '../models/problem.models.js';
import { SavedProblem } from '../models/saved-problem.models.js';
import { Project } from "../models/project.models.js";
import {Team} from '../models/team-models.js'

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

  const {problemId} = req.params;

  if(!mongoose.Types.ObjectId.isValid(problemId)){
    throw new ApiError(400, "Invalid problem id");
  }

  const problem = await Problem.findOne({
    _id: problemId,
    isDeleted: false,
    verificationStatus: "verified"
  });

  if(!problem){
    throw new ApiError(404, "Problem not found");
  }

  let savedDoc;
  try {
    savedDoc = await SavedProblem.create({ user: req.user._id, problem: problem._id });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "Problem already saved");
    }
    throw err;
  }

  return res
    .status(200)
    .json(new ApiResponse(200, savedDoc, "Problem saved successfully"));
});

const unsaveProblem = asyncHandler(async(req, res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access");
  }

  const {problemId} = req.params;
  if(!mongoose.Types.ObjectId.isValid(problemId)){
    throw new ApiError(400, "Invalid problem Id");
  }

  const result = await SavedProblem.deleteOne({user: req.user._id, problem: problemId});
  if(result.deletedCount === 0){
    throw new ApiError(404, "Saved problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, {problemId}, "Unsaved problem successfully"));
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
    ));
});

const adoptProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }

  const problem = await Problem.findOneAndUpdate(
    {
      _id: problemId,
      isDeleted: false,
      isRejected: { $ne: true },
      verificationStatus: "verified",
      isAdopted: { $ne: true },
    },
    {
      $set: {
        isAdopted: true,
        adoptedBy: req.user._id,
        adoptedAt: new Date(),
      },
    },
    { new: true }
  ).select("title isAdopted adoptedBy adoptedAt");

  if (!problem) {
    throw new ApiError(404, "Problem not found or no longer available for adoption");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Problem adopted successfully"));
});

const abandonProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }

  const problem = await Problem.findOneAndUpdate(
    {
      _id: problemId,
      isDeleted: false,
      isAdopted: true,
      adoptedBy: req.user._id,
    },
    {
      $set: { isAdopted: false },
      $unset: { adoptedBy: "", adoptedAt: "" },
    },
    { new: true }
  ).select("title isAdopted");

  if (!problem) {
    throw new ApiError(404, "Adopted problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Problem abandoned successfully"));
});

const createProject = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const {
    teamId, problemId, projectName, projectDescription,
    objective, expectedSolution, technologies, estimatedDuration,
  } = req.body ?? {};

  if (!mongoose.Types.ObjectId.isValid(teamId) || !mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Valid teamId and problemId are required");
  }

  for (const [field, value] of Object.entries({ projectName, objective, expectedSolution })) {
    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(400, `${field} is required`);
    }
  }

  if (!Array.isArray(technologies)) {
    throw new ApiError(400, "technologies must be an array");
  }
  const cleanTechnologies = technologies.map((t) => String(t).trim()).filter(Boolean);
  if (cleanTechnologies.length === 0) {
    throw new ApiError(400, "At least one technology is required");
  }

  let duration;
  if (estimatedDuration !== undefined && estimatedDuration !== null && estimatedDuration !== "") {
    duration = Number(estimatedDuration);
    if (!Number.isFinite(duration) || duration < 1) {
      throw new ApiError(400, "estimatedDuration must be a number of at least 1");
    }
  }

  // Caller must be a member of the team, non-members get a 404
  const team = await Team.findOne({ _id: teamId, teamMembers: req.user._id }).select("teamMembers");
  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const problem = await Problem.findOne({
    _id: problemId,
    isDeleted: false,
    isRejected: { $ne: true },
    verificationStatus: "verified",
  }).select("isAdopted adoptedBy");
  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }

  // The problem must have been adopted by someone on this team
  const adoptedByTeamMember =
    problem.isAdopted && team.teamMembers.some((id) => id.equals(problem.adoptedBy));
  if (!adoptedByTeamMember) {
    throw new ApiError(409, "This problem must be adopted by a member of your team first");
  }

  let project;
  try {
    project = await Project.create({
      projectName: projectName.trim(),
      projectDescription: typeof projectDescription === "string" ? projectDescription.trim() : undefined,
      objective: objective.trim(),
      expectedSolution: expectedSolution.trim(),
      technologies: cleanTechnologies,
      estimatedDuration: duration,
      problem: problem._id,
      team: team._id,
      createdBy: req.user._id,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "Your team already has a project for this problem");
    }
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, project, "Project created successfully"));
});

const getMyProjects = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 12, 1), 50);

  const teamIds = await Team.distinct("_id", { teamMembers: req.user._id });
  const filter = { team: { $in: teamIds } };

  const [projects, total] = await Promise.all([
    Project.find(filter)
      .select("projectName projectDescription technologies estimatedDuration problem team createdAt")
      .populate("problem", "title category severity urgency problemPhoto")
      .populate("team", "name")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Project.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(total / limit);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        projects,
        pagination: { total, page, limit, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
      },
      "Projects fetched successfully"
    )
  );
});

const getProject = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid project id");
  }

  const teamIds = await Team.distinct("_id", { teamMembers: req.user._id });

  const project = await Project.findOne({ _id: projectId, team: { $in: teamIds } })
    .populate("problem", "title category severity urgency location locationType problemPhoto")
    .populate({
      path: "team",
      select: "name leader teamMembers maxMembers",
      populate: { path: "teamMembers", select: "username fullName" },
    })
    .populate("createdBy", "username fullName")
    .lean();

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, project, "Project fetched successfully"));
});

const updateProject = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid project id");
  }

  const body = req.body ?? {};
  const updatedFields = {};

  for (const field of ["projectName", "objective", "expectedSolution"]) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(400, `${field} cannot be empty`);
    }
    updatedFields[field] = value.trim();
  }

  if (body.projectDescription !== undefined) {
    if (typeof body.projectDescription !== "string") {
      throw new ApiError(400, "projectDescription must be a string");
    }
    updatedFields.projectDescription = body.projectDescription.trim();
  }

  if (body.technologies !== undefined) {
    if (!Array.isArray(body.technologies)) {
      throw new ApiError(400, "technologies must be an array");
    }
    const clean = body.technologies.map((t) => String(t).trim()).filter(Boolean);
    if (clean.length === 0) {
      throw new ApiError(400, "At least one technology is required");
    }
    updatedFields.technologies = clean;
  }

  if (body.estimatedDuration !== undefined) {
    const n = Number(body.estimatedDuration);
    if (body.estimatedDuration === null || body.estimatedDuration === "" || !Number.isFinite(n) || n < 1) {
      throw new ApiError(400, "estimatedDuration must be a number of at least 1");
    }
    updatedFields.estimatedDuration = n;
  }

  if (Object.keys(updatedFields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  const teamIds = await Team.distinct("_id", { teamMembers: req.user._id });

  const project = await Project.findOneAndUpdate(
    { _id: projectId, team: { $in: teamIds } },
    { $set: updatedFields },
    { new: true, runValidators: true }
  );

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, project, "Project updated successfully"));
});

const deleteProject = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid project id");
  }

  const teamIds = await Team.distinct("_id", { leader: req.user._id });

  const project = await Project.findOneAndDelete({
    _id: projectId,
    team: { $in: teamIds },
  }).select("_id");

  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { projectId }, "Project deleted successfully"));
});
export {browseProblems, savedProblem, unsaveProblem, getSavedProblems, adoptProblem, abandonProblem, createProject, getMyProjects, getProject, updateProject, deleteProject};