import { Profile } from "../models/profile.models.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";

const createProfile = asyncHandler(async (req,res) => {

  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access")
  }

  const {name, phone, bio} = req.body;
  if ([name, phone, bio].some((field) => !field || String(field).trim() === "")) {
    throw new ApiError(400, "Name, phone, and bio are required")
  }

  const profilePhotoLocalPath = req.files?.profilePhoto?.[0];

  if(!profilePhotoLocalPath){
    throw new ApiError(400, "profile photo required");
  }
   const profilePhoto = await uploadOnCloudinary(profilePhotoLocalPath)

  if (!profilePhoto?.url) {
    throw new ApiError(500, "Error occurred while uploading photo")
  }

  const profile = await Profile.create({
    name: name.trim(),
    bio,
    phone: phone.trim(),
    profilePhoto: profilePhoto?.url
  });

  const createdProfile = await Profile.findById(profile?._id);

  if(!createdProfile){
    throw new ApiError(404, "Profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, "profile created successfully", profile));
});

export { createProfile }