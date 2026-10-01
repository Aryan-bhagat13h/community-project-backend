import { Profile } from "../models/profile.models.js";
import { ApiError } from "../utils/api-error.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js"; 

const createProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { phone, bio } = req.body;

  if (!phone || String(phone).trim() === "") {
    throw new ApiError(400, "Phone is required");
  }


  const existingProfile = await Profile.findOne({ user: req.user._id });
  if (existingProfile) {
    throw new ApiError(409, "Profile already exists for this user");
  }

  const profilePhotoLocalPath = req.files?.profilePhoto?.[0]?.path;
  if (!profilePhotoLocalPath) {
    throw new ApiError(400, "Profile photo is required");
  }

  const uploaded = await uploadOnCloudinary(profilePhotoLocalPath);
  const photoUrl = uploaded?.secure_url || uploaded?.url;
  if (!photoUrl) {
    throw new ApiError(500, "Error occurred while uploading photo");
  }

  const profile = await Profile.create({
    user: req.user._id, 
    phone: phone.trim(),
    bio: bio?.trim(),
    profilePhoto: photoUrl,
  });

  return res
    .status(201)
    .json(new ApiResponse(201, profile, "Profile created successfully"));
});

export { createProfile };