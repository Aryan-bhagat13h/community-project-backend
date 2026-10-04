import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Profile } from "../models/profile.models.js";
import { AdminProfile } from "../models/admin-profile.models.js";
import { ROLE_PROFILE_MODEL } from "../models/role-profile.models.js";

const optionalString = (v) => (v === undefined ? undefined : String(v).trim());

const toStringList = (v) =>
  Array.isArray(v) ? v.map((i) => String(i).trim()).filter(Boolean) : [];

const rethrowAsApiError = (err) => {
  if (err?.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
    throw new ApiError(400, message);
  }
  throw err;
};

// Confirms the caller already holds a super_admin profile. Checked against the
// DB rather than trusting anything in the request body.
const requireSuperAdmin = async (req) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const callerProfile = await Profile.findOne({ user: req.user._id });
  if (
    !callerProfile?.roleProfile ||
    callerProfile.roleProfileModel !== ROLE_PROFILE_MODEL.admin
  ) {
    throw new ApiError(403, "Only a super admin can perform this action");
  }

  const callerAdmin = await AdminProfile.findById(callerProfile.roleProfile);
  if (callerAdmin?.adminType !== "super_admin") {
    throw new ApiError(403, "Only a super admin can perform this action");
  }

  return callerAdmin;
};

const parseUserId = (value) => {
  if (!value || !mongoose.isValidObjectId(value)) {
    throw new ApiError(400, "A valid userId is required");
  }
  return String(value);
};

// Super admin creates an admin profile for another user.
// Body: { userId, adminType?, department?, responsibilities? }
const createAdminProfile = asyncHandler(async (req, res) => {
  await requireSuperAdmin(req);

  const { userId, adminType, department, responsibilities } = req.body;
  const targetUserId = parseUserId(userId);

  const profile = await Profile.findOne({ user: targetUserId });
  if (!profile) {
    throw new ApiError(404, "Target user has no base profile yet");
  }
  if (profile.roleProfile) {
    throw new ApiError(409, "Role profile already exists for this user");
  }

  let adminProfile;
  try {
    adminProfile = await AdminProfile.create({
      adminType: optionalString(adminType), // undefined -> schema default "moderator"
      department: optionalString(department),
      responsibilities: toStringList(responsibilities),
      createdBy: req.user._id,
    });
  } catch (err) {
    rethrowAsApiError(err);
  }

  try {
    profile.roleProfile = adminProfile._id;
    profile.roleProfileModel = ROLE_PROFILE_MODEL.admin;
    await profile.save();
  } catch (err) {
    await AdminProfile.findByIdAndDelete(adminProfile._id);
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, adminProfile, "Admin profile created successfully"));
});

// Any admin updates their OWN department / responsibilities.
// adminType and createdBy are deliberately not editable here.
const updateAdminProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const profile = await Profile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Profile not found");
  }
  if (!profile.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.admin) {
    throw new ApiError(404, "Admin profile not found");
  }

  const { department, responsibilities } = req.body;
  const updatedFields = {};

  if (department !== undefined) updatedFields.department = optionalString(department);
  if (responsibilities !== undefined) {
    updatedFields.responsibilities = toStringList(responsibilities);
  }

  if (Object.keys(updatedFields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  let adminProfile;
  try {
    adminProfile = await AdminProfile.findByIdAndUpdate(
      profile.roleProfile,
      { $set: updatedFields },
      { new: true, runValidators: true }
    );
  } catch (err) {
    rethrowAsApiError(err);
  }

  if (!adminProfile) {
    throw new ApiError(404, "Admin profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, adminProfile, "Admin profile updated successfully"));
});

// Super admin promotes / demotes ANOTHER admin.
// Route: PATCH /:userId/type    Body: { adminType }
const changeAdminType = asyncHandler(async (req, res) => {
  await requireSuperAdmin(req);

  const targetUserId = parseUserId(req.params.userId);
  if (targetUserId === String(req.user._id)) {
    throw new ApiError(400, "You cannot change your own admin type");
  }

  const adminType = optionalString(req.body.adminType);
  if (!adminType) {
    throw new ApiError(400, "adminType is required");
  }

  const profile = await Profile.findOne({ user: targetUserId });
  if (!profile?.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.admin) {
    throw new ApiError(404, "Admin profile not found for this user");
  }

  let adminProfile;
  try {
    adminProfile = await AdminProfile.findByIdAndUpdate(
      profile.roleProfile,
      { $set: { adminType } },
      { new: true, runValidators: true }
    );
  } catch (err) {
    rethrowAsApiError(err);
  }

  if (!adminProfile) {
    throw new ApiError(404, "Admin profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, adminProfile, "Admin type updated successfully"));
});

export { createAdminProfile, updateAdminProfile, changeAdminType };