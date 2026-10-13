import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Team } from "../models/team-models.js";
import { Project } from "../models/project.models.js";
import { Proposal } from "../models/proposal.models.js";


const buildProposalFields = (body, isCreate) => {
  const fields = {};
  const set = (path, value) => {
    if (value !== undefined) fields[path] = value;
  };

  const text = (value, name, required = false) => {
    if (value === undefined) {
      if (required && isCreate) throw new ApiError(400, `${name} is required`);
      return undefined;
    }
    if (typeof value !== "string" || (required && !value.trim())) {
      throw new ApiError(400, required ? `${name} is required` : `${name} must be a string`);
    }
    return value.trim();
  };

  const list = (value, name) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new ApiError(400, `${name} must be an array`);
    return value.map((i) => String(i).trim()).filter(Boolean);
  };

  const num = (value, name, required = false) => {
    if (value === undefined) {
      if (required && isCreate) throw new ApiError(400, `${name} is required`);
      return undefined;
    }
    const n = Number(value);
    if (value === null || value === "" || !Number.isFinite(n) || n < 0) {
      throw new ApiError(400, `${name} must be a number of at least 0`);
    }
    return n;
  };

  const date = (value, name) => {
    if (value === undefined) return undefined;
    const d = new Date(value);
    if (value === null || Number.isNaN(d.getTime())) {
      throw new ApiError(400, `${name} must be a valid date`);
    }
    return d;
  };

  const section = (value, name) => {
    if (value === undefined) return undefined;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new ApiError(400, `${name} must be an object`);
    }
    return value;
  };

  const objects = (value, name, mapper) => {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new ApiError(400, `${name} must be an array`);
    return value.map((item, i) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) {
        throw new ApiError(400, `${name}[${i}] must be an object`);
      }
      return mapper(item, `${name}[${i}]`);
    });
  };

  set("title", text(body.title, "title", true));
  set("description", text(body.description, "description"));
  set("problemSummary", text(body.problemSummary, "problemSummary"));
  set("rootCauses", text(body.rootCauses, "rootCauses"));
  set("peopleAffected", num(body.peopleAffected, "peopleAffected", true));
  set("solutionDescription", text(body.solutionDescription, "solutionDescription", true));
  set("howItWorks", text(body.howItWorks, "howItWorks", true));
  set("keyFeatures", list(body.keyFeatures, "keyFeatures"));

  const resources = section(body.resources, "resources") ?? {};
  for (const key of ["software", "hardware", "equipment", "materials", "data", "infrastructure"]) {
    set(`resources.${key}`, list(resources[key], `resources.${key}`));
  }

  const budget = section(body.budget, "budget") ?? {};
  set("budget.estimatedCost", num(budget.estimatedCost, "budget.estimatedCost"));
  set("budget.currency", text(budget.currency, "budget.currency"));
  set("budget.fundingRequirements", text(budget.fundingRequirements, "budget.fundingRequirements"));
  set(
    "budget.itemizedExpenses",
    objects(budget.itemizedExpenses, "budget.itemizedExpenses", (e, name) => ({
      item: text(e.item, `${name}.item`),
      amount: num(e.amount, `${name}.amount`),
    }))
  );

  const timeline = section(body.timeline, "timeline") ?? {};
  set("timeline.startDate", date(timeline.startDate, "timeline.startDate"));
  set("timeline.endDate", date(timeline.endDate, "timeline.endDate"));
  set(
    "timeline.milestones",
    objects(timeline.milestones, "timeline.milestones", (m, name) => ({
      title: text(m.title, `${name}.title`),
      description: text(m.description, `${name}.description`),
      dueDate: date(m.dueDate, `${name}.dueDate`),
    }))
  );
  set("timeline.deliverables", list(timeline.deliverables, "timeline.deliverables"));

  const beneficiaries = section(body.beneficiaries, "beneficiaries") ?? {};
  set("beneficiaries.targetPopulation", text(beneficiaries.targetPopulation, "beneficiaries.targetPopulation"));
  set("beneficiaries.organizations", list(beneficiaries.organizations, "beneficiaries.organizations"));
  set("beneficiaries.communities", list(beneficiaries.communities, "beneficiaries.communities"));

  const risk = section(body.riskAssessment, "riskAssessment") ?? {};
  set(
    "riskAssessment.risks",
    objects(risk.risks, "riskAssessment.risks", (r, name) => ({
      description: text(r.description, `${name}.description`),
      mitigation: text(r.mitigation, `${name}.mitigation`),
    }))
  );
  set("riskAssessment.constraints", list(risk.constraints, "riskAssessment.constraints"));
  set("riskAssessment.dependencies", list(risk.dependencies, "riskAssessment.dependencies"));

  set(
    "attachments",
    objects(body.attachments, "attachments", (a, name) => ({
      category: text(a.category, `${name}.category`),
      name: text(a.name, `${name}.name`),
      url: text(a.url, `${name}.url`),
      publicId: text(a.publicId, `${name}.publicId`),
    }))
  );

  const start = fields["timeline.startDate"];
  const end = fields["timeline.endDate"];
  if (start && end && end < start) {
    throw new ApiError(400, "timeline.endDate cannot be before timeline.startDate");
  }

  return fields;
};

const createProposal = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const body = req.body ?? {};
  const { projectId } = body;
  if (typeof projectId !== "string" || !mongoose.Types.ObjectId.isValid(projectId)) {
    throw new ApiError(400, "A valid projectId is required");
  }

  const fields = buildProposalFields(body, true);

  // Any member of the project's team can write its proposal
  const teamIds = await Team.distinct("_id", { teamMembers: req.user._id });
  const project = await Project.findOne({ _id: projectId, team: { $in: teamIds } }).select("team");
  if (!project) {
    throw new ApiError(404, "Project not found");
  }

  const proposal = new Proposal({
    project: project._id,
    team: project.team,
    createdBy: req.user._id,
  });
  proposal.set(fields);

  try {
    await proposal.save();
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "This project already has a proposal");
    }
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, proposal, "Proposal created successfully"));
});

const updateProposal = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { proposalId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(proposalId)) {
    throw new ApiError(400, "Invalid proposal id");
  }

  const fields = buildProposalFields(req.body ?? {}, false);
  if (Object.keys(fields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  const teamIds = await Team.distinct("_id", { teamMembers: req.user._id });

  const existing = await Proposal.findOne({ _id: proposalId, team: { $in: teamIds } })
    .select("status timeline.startDate timeline.endDate");
  if (!existing) {
    throw new ApiError(404, "Proposal not found");
  }
  if (existing.status !== "draft") {
    throw new ApiError(409, `A ${existing.status} proposal can no longer be edited`);
  }

  const start = fields["timeline.startDate"] ?? existing.timeline?.startDate;
  const end = fields["timeline.endDate"] ?? existing.timeline?.endDate;
  if (start && end && end < start) {
    throw new ApiError(400, "timeline.endDate cannot be before timeline.startDate");
  }

  const proposal = await Proposal.findOneAndUpdate(
    { _id: proposalId, team: { $in: teamIds }, status: "draft" },
    { $set: fields },
    { new: true, runValidators: true }
  );

  if (!proposal) {
    throw new ApiError(409, "Proposal can no longer be edited");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, proposal, "Proposal updated successfully"));
});

const deleteProposal = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { proposalId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(proposalId)) {
    throw new ApiError(400, "Invalid proposal id");
  }

  // Only the team leader can delete, and only while it's still a draft
  const teamIds = await Team.distinct("_id", { leader: req.user._id });

  const proposal = await Proposal.findOneAndDelete({
    _id: proposalId,
    team: { $in: teamIds },
    status: "draft",
  }).select("_id");

  if (!proposal) {
    throw new ApiError(404, "Proposal not found, or it can no longer be deleted");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, { proposalId }, "Proposal deleted successfully"));
});

const getProposal = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { proposalId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(proposalId)) {
    throw new ApiError(400, "Invalid proposal id");
  }

  const proposal = await Proposal.findById(proposalId)
    .populate("project", "projectName projectDescription")
    .populate("team", "name leader teamMembers")
    .populate("createdBy", "username fullname");

  if (!proposal) {
    throw new ApiError(404, "Proposal not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, proposal, "Proposal fetched successfully"));
});

export { createProposal, updateProposal, deleteProposal, getProposal };