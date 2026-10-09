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

const addMembers = asyncHandler(async(req,res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access")
  }
})
export {createTeam, addMembers}