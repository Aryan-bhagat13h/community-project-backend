import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { Profile } from '../models/profile.models.js';
import { FacultyProfile } from "../models/faculty-profile.models.js";
import { Project } from "../models/project.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Proposal, PROPOSAL_SECTIONS } from "../models/proposal.models.js";
import { ROLE_PROFILE_MODEL } from "../models/role-profile.models.js";


const getMentorshipRequests = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const profile = await Profile.findOne({ user: req.user._id }).select("roleProfile roleProfileModel");
  if (!profile?.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.faculty) {
    throw new ApiError(403, "Only faculty can view mentorship requests");
  }

  const faculty = await FacultyProfile.findById(profile.roleProfile)
    .select("isRequested requestedBy isRequestAccepted updatedAt")
    .populate({
      path: "requestedBy",
      select: "name description maxMembers leader teamMembers",
      populate: [
        { path: "leader", select: "username fullName" },
        { path: "teamMembers", select: "username fullName" },
      ],
    })
    .lean();

  if (!faculty) {
    throw new ApiError(404, "Faculty profile not found");
  }

  if (!faculty.isRequested || !faculty.requestedBy) {
    return res
      .status(200)
      .json(new ApiResponse(200, { requests: [] }, "No mentorship requests"));
  }

  const projects = await Project.find({ team: faculty.requestedBy._id })
    .select("projectName projectDescription technologies estimatedDuration problem")
    .populate("problem", "title category severity urgency")
    .lean();

  const request = {
    status: faculty.isRequestAccepted ? "accepted" : "pending",
    team: faculty.requestedBy,
    projects,
    updatedAt: faculty.updatedAt,
  };

  return res
    .status(200)
    .json(new ApiResponse(200, { requests: [request] }, "Mentorship requests fetched successfully"));
});

const acceptMentorshipRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const profile = await Profile.findOne({ user: req.user._id }).select("roleProfile roleProfileModel");
  if (!profile?.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.faculty) {
    throw new ApiError(403, "Only faculty can accept mentorship requests");
  }

  const faculty = await FacultyProfile.findOneAndUpdate(
    {
      _id: profile.roleProfile,
      isRequested: true,
      isRequestAccepted: { $ne: true },
    },
    { $set: { isRequestAccepted: true } },
    { new: true }
  )
    .select("isRequested requestedBy isRequestAccepted")
    .populate("requestedBy", "name");

  if (!faculty) {
    throw new ApiError(404, "No pending mentorship request found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, faculty, "Mentorship request accepted successfully"));
});

const rejectMentorshipRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const profile = await Profile.findOne({ user: req.user._id }).select("roleProfile roleProfileModel");
  if (!profile?.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.faculty) {
    throw new ApiError(403, "Only faculty can reject mentorship requests");
  }

  const faculty = await FacultyProfile.findOneAndUpdate(
    {
      _id: profile.roleProfile,
      isRequested: true,
      isRequestAccepted: { $ne: true },
    },
    {
      $set: { isRequested: false, isRequestAccepted: false },
      $unset: { requestedBy: "" },
    },
    { new: true }
  ).select("isRequested isRequestAccepted");

  if (!faculty) {
    throw new ApiError(404, "No pending mentorship request found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, faculty, "Mentorship request rejected successfully"));
});

const rejectProposal = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { proposalId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(proposalId)) {
    throw new ApiError(400, "Invalid proposal id");
  }

  const { rejectionReason } = req.body ?? {};
  if (typeof rejectionReason !== "string" || !rejectionReason.trim()) {
    throw new ApiError(400, "Rejection reason cannot be empty");
  }

  const profile = await Profile.findOne({ user: req.user._id }).select("roleProfile roleProfileModel");
  if (!profile?.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.faculty) {
    throw new ApiError(403, "Only faculty can reject proposals");
  }

  const faculty = await FacultyProfile.findOne({
    _id: profile.roleProfile,
    isRequested: true,
    isRequestAccepted: true,
  }).select("requestedBy");

  if (!faculty?.requestedBy) {
    throw new ApiError(403, "You are not mentoring any team");
  }

  const proposal = await Proposal.findOneAndUpdate(
    {
      _id: proposalId,
      team: faculty.requestedBy,
      isRejected: { $ne: true },
      status: { $in: ["submitted", "under_review"] },
    },
    {
      $set: {
        isRejected: true,
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: req.user._id,
        rejectionReason: rejectionReason.trim(),
      },
    },
    { new: true }
  );

  if (!proposal) {
    throw new ApiError(404, "Proposal not found or it can no longer be rejected");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, proposal, "Proposal rejected successfully"));
});

const suggestChanges = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { proposalId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(proposalId)) {
    throw new ApiError(400, "Invalid proposal id");
  }

  const { suggestions } = req.body ?? {};
  if (!Array.isArray(suggestions) || suggestions.length === 0 || suggestions.length > 10) {
    throw new ApiError(400, "suggestions must be an array of 1 to 10 items");
  }

  const cleaned = suggestions.map((s, i) => {
    if (typeof s !== "object" || s === null || Array.isArray(s)) {
      throw new ApiError(400, `suggestions[${i}] must be an object`);
    }
    const message = typeof s.message === "string" ? s.message.trim() : "";
    if (!message) {
      throw new ApiError(400, `suggestions[${i}].message is required`);
    }
    const section = s.section === undefined ? "general" : s.section;
    if (!PROPOSAL_SECTIONS.includes(section)) {
      throw new ApiError(400, `suggestions[${i}].section must be one of: ${PROPOSAL_SECTIONS.join(", ")}`);
    }
    return { suggestedBy: req.user._id, section, message };
  });

  const profile = await Profile.findOne({ user: req.user._id }).select("roleProfile roleProfileModel");
  if (!profile?.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.faculty) {
    throw new ApiError(403, "Only faculty can suggest changes");
  }

  const faculty = await FacultyProfile.findOne({
    _id: profile.roleProfile,
    isRequested: true,
    isRequestAccepted: true,
  }).select("requestedBy");

  if (!faculty?.requestedBy) {
    throw new ApiError(403, "You are not mentoring any team");
  }

  const proposal = await Proposal.findOneAndUpdate(
    {
      _id: proposalId,
      team: faculty.requestedBy,
      isRejected: { $ne: true },
      status: { $in: ["submitted", "under_review", "needs_revision"] },
    },
    {
      $push: { suggestions: { $each: cleaned } },
      $set: { status: "needs_revision" },
    },
    { new: true, runValidators: true }
  ).select("title status suggestions");

  if (!proposal) {
    throw new ApiError(404, "Proposal not found or it can no longer receive suggestions");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, proposal, "Suggestions sent to the team successfully"));
});
export {getMentorshipRequests, acceptMentorshipRequest, rejectMentorshipRequest, rejectProposal, suggestChanges}