import mongoose from "mongoose";
import {ApiError} from '../utils/api-error.js';
import {asyncHandler} from '../utils/async-handler.js';
import { ApiResponse } from '../utils/api-response.js';
import { Problem } from '../models/problem.models.js';
import { SavedProblem } from '../models/saved-problem.models.js';
import { Project } from "../models/project.models.js";
import {Team} from '../models/team-models.js';
import { FacultyProfile } from "../models/faculty-profile.models.js";
import { Profile } from "../models/profile.models.js";
import { ROLE_PROFILE_MODEL } from "../models/role-profile.models.js";
import { ProgressUpdate } from "../models/progress-update.models.js";

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

const findMentor = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { teamId } = req.params;
  const { projectId } = req.query;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(400, "Invalid team id");
  }
  if (projectId !== undefined && (typeof projectId !== "string" || !mongoose.Types.ObjectId.isValid(projectId))) {
    throw new ApiError(400, "Invalid project id");
  }

  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 30);
  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Any member of the team can look for a mentor
  const team = await Team.findOne({ _id: teamId, teamMembers: req.user._id }).select("leader");
  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const projectFilter = { team: team._id };
  if (projectId) projectFilter._id = projectId;

  const projects = await Project.find(projectFilter)
    .select("technologies problem")
    .populate("problem", "category subCategory skills")
    .lean();

  if (projectId && projects.length === 0) {
    throw new ApiError(404, "Project not found");
  }

  // Problems adopted by the leader
  const adoptedProblems = projectId
    ? []
    : await Problem.find({ adoptedBy: team.leader, isAdopted: true, isDeleted: false })
        .select("category subCategory skills")
        .lean();

  // Build search keywords from projects and problems
  const keywordSet = new Set();
  const addKeyword = (v) => {
    if (typeof v !== "string") return;
    const k = v.replace(/_/g, " ").trim().toLowerCase();
    if (k && k !== "other") keywordSet.add(k);
  };
  const addProblem = (p) => {
    if (!p) return;
    addKeyword(p.category);
    (p.subCategory ?? []).forEach(addKeyword);
    (p.skills ?? []).forEach(addKeyword);
  };

  projects.forEach((pr) => {
    (pr.technologies ?? []).forEach(addKeyword);
    addProblem(pr.problem);
  });
  adoptedProblems.forEach(addProblem);

  const keywords = [...keywordSet].slice(0, 30);
  if (keywords.length === 0) {
    throw new ApiError(409, "Adopt a problem or create a project first so mentors can be matched");
  }

  const matchers = keywords.map((k) => ({
    keyword: k,
    regex: new RegExp(k.length < 4 ? `\\b${escapeRegex(k)}\\b` : escapeRegex(k), "i"),
  }));
  const regexes = matchers.map((m) => m.regex);

  const candidates = await FacultyProfile.find({
    verificationStatus: "verified",
    $or: [
      { mentorshipAreas: { $in: regexes } },
      { expertise: { $in: regexes } },
      { researchInterests: { $in: regexes } },
    ],
  })
    .select("institution department designation expertise researchInterests mentorshipAreas experience availability linkedin profileUrl")
    .limit(200)
    .lean();

  const fieldWeights = { mentorshipAreas: 3, expertise: 2, researchInterests: 2 };

  const ranked = candidates
    .map((f) => {
      const matchedOn = new Set();
      let matchScore = 0;
      for (const [field, weight] of Object.entries(fieldWeights)) {
        const values = f[field] ?? [];
        for (const { keyword, regex } of matchers) {
          if (values.some((v) => regex.test(v))) {
            matchScore += weight;
            matchedOn.add(keyword);
          }
        }
      }
      return { ...f, matchScore, matchedOn: [...matchedOn] };
    })
    .sort((a, b) => b.matchScore - a.matchScore || (b.experience ?? 0) - (a.experience ?? 0))
    .slice(0, limit);

  const baseProfiles = await Profile.find({
    roleProfile: { $in: ranked.map((f) => f._id) },
    roleProfileModel: ROLE_PROFILE_MODEL.faculty,
  })
    .select("user roleProfile")
    .populate("user", "username fullName")
    .lean();

  const userByFaculty = new Map(baseProfiles.map((p) => [String(p.roleProfile), p.user]));

  const mentors = ranked.map((f) => ({ ...f, user: userByFaculty.get(String(f._id)) ?? null }));

  return res
    .status(200)
    .json(new ApiResponse(200, { keywords, mentors }, "Mentors fetched successfully"));
});

const sendMentorRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { teamId, facultyId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(teamId) || !mongoose.Types.ObjectId.isValid(facultyId)) {
    throw new ApiError(400, "Invalid team or faculty id");
  }

  const team = await Team.findOne({ _id: teamId, leader: req.user._id }).select("_id");
  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const teamAlreadyRequested = await FacultyProfile.exists({
    requestedBy: team._id,
    isRequested: true,
  });
  if (teamAlreadyRequested) {
    throw new ApiError(409, "Your team already has a pending or accepted mentor request");
  }

  const faculty = await FacultyProfile.findOneAndUpdate(
    {
      _id: facultyId,
      verificationStatus: "verified",
      isRequested: { $ne: true },
    },
    {
      $set: {
        isRequested: true,
        requestedBy: team._id,
        isRequestAccepted: false,
      },
    },
    { new: true }
  ).select("institution department designation isRequested requestedBy");

  if (!faculty) {
    const exists = await FacultyProfile.exists({ _id: facultyId, verificationStatus: "verified" });
    if (exists) {
      throw new ApiError(409, "This mentor already has a request");
    }
    throw new ApiError(404, "Mentor not found");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, faculty, "Mentor request sent successfully"));
});

const viewFacultyProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { facultyId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(facultyId)) {
    throw new ApiError(400, "Invalid faculty id");
  }

  const faculty = await FacultyProfile.findOne({
    _id: facultyId,
    verificationStatus: "verified",
  })
    .select(
      "institution department designation qualifications expertise researchInterests subjects mentorshipAreas experience availability linkedin profileUrl isRequested"
    )
    .lean();

  if (!faculty) {
    throw new ApiError(404, "Faculty not found");
  }

  const baseProfile = await Profile.findOne({
    roleProfile: faculty._id,
    roleProfileModel: ROLE_PROFILE_MODEL.faculty,
  })
    .select("user")
    .populate("user", "username fullName")
    .lean();

  const { isRequested, ...details } = faculty;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        ...details,
        user: baseProfile?.user ?? null,
        isAvailableForMentoring: !isRequested,
      },
      "Faculty profile fetched successfully"
    )
  );
});
const shareProjectProgress = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { projectId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "Invalid project id");
  }

  const {
    title, description, percentComplete,
    completedMilestones, challenges, nextSteps, attachments,
  } = req.body ?? {};

  for (const [field, value] of Object.entries({ title, description })) {
    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(400, `${field} is required`);
    }
  }

  let percent;
  if (percentComplete !== undefined && percentComplete !== null && percentComplete !== "") {
    percent = Number(percentComplete);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
      throw new ApiError(400, "percentComplete must be a number between 0 and 100");
    }
  }

  if (completedMilestones !== undefined && !Array.isArray(completedMilestones)) {
    throw new ApiError(400, "completedMilestones must be an array");
  }

  let cleanAttachments = [];
  if (attachments !== undefined) {
    if (!Array.isArray(attachments)) {
      throw new ApiError(400, "attachments must be an array of { name, url, publicId }");
    }
    cleanAttachments = attachments
      .filter((a) => a && typeof a.url === "string" && a.url.trim())
      .map((a) => ({
        name: typeof a.name === "string" ? a.name.trim() : undefined,
        url: a.url.trim(),
        publicId: typeof a.publicId === "string" ? a.publicId.trim() : undefined,
      }));
  }

  const teamIds = await Team.distinct("_id", { teamMembers: req.user._id });
  const project = await Project.findOne({ _id: projectId, team: { $in: teamIds } }).select("team");
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const update = await ProgressUpdate.create({
    project: project._id,
    team: project.team,
    postedBy: req.user._id,
    title: title.trim(),
    description: description.trim(),
    percentComplete: percent,
    completedMilestones: (completedMilestones ?? []).map((m) => String(m).trim()).filter(Boolean),
    challenges: typeof challenges === "string" ? challenges.trim() : undefined,
    nextSteps: typeof nextSteps === "string" ? nextSteps.trim() : undefined,
    attachments: cleanAttachments,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, update, "Progress shared successfully"));
});

import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Team } from "../models/team.models.js";

const getMyTeam = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const teams = await Team.find({ teamMembers: req.user._id })
    .populate("teamMembers", "fullname username email role")
    .lean();

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        teams,
        teams.length ? "Teams fetched successfully" : "You are not part of any team yet"
      )
    );
});

export { getMyTeam };

export {browseProblems, savedProblem, unsaveProblem, getSavedProblems, adoptProblem, abandonProblem, createProject, getMyProjects, getProject, updateProject, deleteProject, findMentor, sendMentorRequest, viewFacultyProfile, shareProjectProgress, getMyTeam};