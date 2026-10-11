import { asyncHandler } from "../utils/async-handler.js";
import {Profile} from '../models/problem.models.js'
import { FacultyProfile } from "../models/faculty-profile.models.js";
import { Project } from "../models/project.models.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";


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

export {getMentorshipRequests, acceptMentorshipRequest, rejectMentorshipRequest}