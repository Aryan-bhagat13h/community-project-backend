import mongoose from "mongoose";
import { asyncHandler } from '../utils/async-handler.js';
import { Team } from '../models/team-models.js';
import { User } from '../models/user.models.js';
import { JoinRequest } from '../models/join-request.model.js';
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';

const createTeam = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { name, description, maxMembers } = req.body ?? {};

  if (!name || typeof name !== "string" || name.trim() === "") {
    throw new ApiError(400, "Team name is required");
  }

  const limit = Number(maxMembers) || 5;
  if (limit < 2 || limit > 8) {
    throw new ApiError(400, "maxMembers must be between 2 and 8");
  }

  const team = await Team.create({
    name: name.trim(),
    description: description ? String(description).trim() : "",
    maxMembers: limit,
    leader: req.user._id,
    teamMembers: [req.user._id],
  });

  if (!team) {
    throw new ApiError(500, "Error occurred while creating team");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, team, "Team created successfully"));
});

const addMembers = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { teamId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(400, "Invalid team id");
  }

  const { userIds } = req.body ?? {};
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new ApiError(400, "userIds must be a non-empty array");
  }
  if (userIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    throw new ApiError(400, "userIds contains an invalid id");
  }

  const team = await Team.findOne({ _id: teamId, teamMembers: req.user._id });
  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const existing = new Set(team.teamMembers.map(String));
  const newIds = [...new Set(userIds.map(String))].filter((id) => !existing.has(id));

  if (newIds.length === 0) {
    throw new ApiError(409, "All of these users are already members");
  }

  const slotsLeft = team.maxMembers - team.teamMembers.length;
  if (newIds.length > slotsLeft) {
    throw new ApiError(409, `Only ${slotsLeft} slot(s) left in this team`);
  }

  const foundUsers = await User.countDocuments({ _id: { $in: newIds } });
  if (foundUsers !== newIds.length) {
    throw new ApiError(404, "One or more users were not found");
  }

  const updatedTeam = await Team.findOneAndUpdate(
    {
      _id: teamId,
      teamMembers: req.user._id,
      $expr: {
        $lte: [{ $add: [{ $size: "$teamMembers" }, newIds.length] }, "$maxMembers"],
      },
    },
    { $addToSet: { teamMembers: { $each: newIds } } },
    { new: true }
  ).populate("teamMembers", "username fullName");

  if (!updatedTeam) {
    throw new ApiError(409, "Team no longer has enough free slots");
  }

  await JoinRequest.updateMany(
    { team: teamId, user: { $in: newIds }, status: "pending" },
    { $set: { status: "accepted", respondedAt: new Date() } }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTeam, "Members added successfully"));
});

const getTeamRequests = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { teamId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    throw new ApiError(400, "Invalid team id");
  }

  const team = await Team.findOne({ _id: teamId, leader: req.user._id }).select("_id");
  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const requests = await JoinRequest.find({ team: teamId, status: "pending" })
    .populate("user", "username fullName")
    .sort({ createdAt: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, requests, "Join requests fetched successfully"));
});

const acceptJoinRequest = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { teamId, requestId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(teamId) || !mongoose.Types.ObjectId.isValid(requestId)) {
    throw new ApiError(400, "Invalid team or request id");
  }

  const team = await Team.findOne({ _id: teamId, leader: req.user._id }).select("_id");
  if (!team) {
    throw new ApiError(404, "Team not found");
  }

  const request = await JoinRequest.findOneAndUpdate(
    { _id: requestId, team: teamId, status: "pending" },
    { $set: { status: "accepted", respondedAt: new Date() } },
    { new: true }
  );
  if (!request) {
    throw new ApiError(404, "Pending request not found");
  }

  const undoAccept = () =>
    JoinRequest.findByIdAndUpdate(request._id, {
      $set: { status: "pending" },
      $unset: { respondedAt: 1 },
    }).catch(() => {
    });

  let updatedTeam;
  try {
    updatedTeam = await Team.findOneAndUpdate(
      {
        _id: teamId,
        teamMembers: { $ne: request.user },
        $expr: { $lt: [{ $size: "$teamMembers" }, "$maxMembers"] },
      },
      { $addToSet: { teamMembers: request.user } },
      { new: true }
    ).populate("teamMembers", "username fullName");
  } catch (err) {
    await undoAccept();
    throw err;
  }

  if (!updatedTeam) {
    await undoAccept();
    throw new ApiError(409, "Team is full or the user is already a member");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updatedTeam, "Join request accepted successfully"));
});
export {createTeam, addMembers, getTeamRequests, acceptJoinRequest}