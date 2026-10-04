import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Profile } from "../models/profile.models.js";
import { ReporterProfile } from "../models/reporter-profile.models.js";
import { ROLE_PROFILE_MODEL } from "../models/role-profile.models.js";

const optionalString = (v) => (v === undefined ? undefined : String(v).trim());

const toStringList = (v) =>
  Array.isArray(v) ? v.map((i) => String(i).trim()).filter(Boolean) : [];

const toDocumentList = (v) =>
  Array.isArray(v)
    ? v
        .filter((d) => d?.url && String(d.url).trim())
        .map((d) => ({
          url: String(d.url).trim(),
          publicId: optionalString(d.publicId),
        }))
    : [];

const rethrowAsApiError = (err) => {
  if (err?.name === "ValidationError") {
    const message = Object.values(err.errors)
      .map((e) => e.message)
      .join(", ");
    throw new ApiError(400, message);
  }
  throw err;
};

const createReporterProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const {
    reporterType, organizationName, contactPerson, designation,
    organizationEmail, organizationPhone, website,
    address, location, description,
    areasOfProblems, preferredCommunication, verificationDocuments,
  } = req.body;

  if (!reporterType || String(reporterType).trim() === "") {
    throw new ApiError(400, "reporterType is required");
  }

  const type = String(reporterType).trim().toLowerCase();
  const orgName = optionalString(organizationName);

  if (type !== "citizen" && !orgName) {
    throw new ApiError(400, "organizationName is required for this reporter type");
  }

  const profile = await Profile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Create your base profile first");
  }
  if (profile.roleProfile) {
    throw new ApiError(409, "Role profile already exists");
  }

  let reporterProfile;
  try {
    reporterProfile = await ReporterProfile.create({
      reporterType: type,
      organizationName: orgName,
      contactPerson: optionalString(contactPerson),
      designation: optionalString(designation),
      organizationEmail: optionalString(organizationEmail),
      organizationPhone: optionalString(organizationPhone),
      website: optionalString(website),
      address: optionalString(address),
      location: optionalString(location),
      description: optionalString(description),
      areasOfProblems: toStringList(areasOfProblems),
      preferredCommunication: optionalString(preferredCommunication),
      verificationDocuments: toDocumentList(verificationDocuments),
    });
  } catch (err) {
    rethrowAsApiError(err);
  }

  try {
    profile.roleProfile = reporterProfile._id;
    profile.roleProfileModel = ROLE_PROFILE_MODEL.reporter;
    await profile.save();
  } catch (err) {
    await ReporterProfile.findByIdAndDelete(reporterProfile._id);
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, reporterProfile, "Reporter profile created successfully"));
});

const updateReporterProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const profile = await Profile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Profile not found");
  }
  if (!profile.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.reporter) {
    throw new ApiError(404, "Reporter profile not found");
  }

  const existing = await ReporterProfile.findById(profile.roleProfile);
  if (!existing) {
    throw new ApiError(404, "Reporter profile not found");
  }

  const {
    reporterType, organizationName, contactPerson, designation,
    organizationEmail, organizationPhone, website,
    address, location, description,
    areasOfProblems, preferredCommunication, verificationDocuments,
  } = req.body;

  const updatedFields = {};

  if (reporterType !== undefined) {
    const v = String(reporterType).trim().toLowerCase();
    if (!v) throw new ApiError(400, "reporterType cannot be empty");
    updatedFields.reporterType = v;
  }

  if (organizationName !== undefined) {
    updatedFields.organizationName = optionalString(organizationName);
  }

  const optionalStrings = {
    contactPerson, designation, organizationEmail, organizationPhone,
    website, address, location, description, preferredCommunication,
  };
  for (const [field, value] of Object.entries(optionalStrings)) {
    if (value !== undefined) updatedFields[field] = optionalString(value);
  }

  if (areasOfProblems !== undefined) {
    updatedFields.areasOfProblems = toStringList(areasOfProblems);
  }

  if (verificationDocuments !== undefined) {
    if (!Array.isArray(verificationDocuments)) {
      throw new ApiError(400, "verificationDocuments must be an array of { url, publicId }");
    }
    updatedFields.verificationDocuments = toDocumentList(verificationDocuments);
  }

  if (Object.keys(updatedFields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }


  const effectiveType = updatedFields.reporterType ?? existing.reporterType;
  const effectiveOrgName =
    updatedFields.organizationName !== undefined
      ? updatedFields.organizationName
      : existing.organizationName;

  if (effectiveType !== "citizen" && !effectiveOrgName) {
    throw new ApiError(400, "organizationName is required for this reporter type");
  }

  let reporterProfile;
  try {
    reporterProfile = await ReporterProfile.findByIdAndUpdate(
      profile.roleProfile,
      { $set: updatedFields },
      { new: true, runValidators: true }
    );
  } catch (err) {
    rethrowAsApiError(err);
  }

  if (!reporterProfile) {
    throw new ApiError(404, "Reporter profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, reporterProfile, "Reporter profile updated successfully"));
});

export { createReporterProfile, updateReporterProfile };