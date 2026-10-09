import {asyncHandler} from '../utils/async-handler.js';
import {Team} from '../models/team-models.js'
import {ApiError} from '../utils/api-error.js';
import {ApiResponse} from '../utils/api-response.js'
const createTeam = asyncHandler(async(req,res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access")
  }

  const {name, description, maxMembers} = req.body;

  if(name.trim === "" || name === undefined){
    throw new ApiError(300, "name for the the team is required");
  }

  if(maxMembers === null || maxMembers > 8){
    throw new ApiError(400, "Please enter valid max members");
  }

  const team = await Team.create({
    $set: {
      name: name.trim(),
      description: description.trim(),
      maxMembers,
      leader: req.user._id
    },
    runValidators: true
  });

  if(!team){
    throw new ApiError(403, "Error occured while creating a team");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, team, "Team created succesfully"))
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
export {createTeam, addMembers}