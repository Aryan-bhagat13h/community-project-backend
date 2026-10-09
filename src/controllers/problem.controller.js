import mongoose from "mongoose";
import { Problem } from "../models/problem.models.js";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from '../utils/api-error.js';
import { ApiResponse } from '../utils/api-response.js';
import { uploadOnCloudinary } from '../utils/cloudinary.js';

const toBoolean = (v, field) => {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  throw new ApiError(400, `${field} must be true or false`);
};

const optionalNumber = (v, field) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) {
    throw new ApiError(400, `${field} must be a non-negative number`);
  }
  return n;
};

const toStringList = (v) => {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map((i) => String(i).trim()).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.map((i) => String(i).trim()).filter(Boolean);
      }
    } catch {
    }
    return v.split(",").map((i) => String(i).trim()).filter(Boolean);
  }
  return [];
};

const toTextList = (v) => {
  if (v === undefined || v === null || v === "") return [];
  if (Array.isArray(v)) return v.map((i) => String(i).trim()).filter(Boolean);
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed.map((i) => String(i).trim()).filter(Boolean);
      }
    } catch {
    }
    return v.trim() ? [v.trim()] : [];
  }
  return [];
};

const isBlank = (v) => v === undefined || v === null || String(v).trim() === "";


const registerProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const {
    title,
    description,
    category,
    subCategory,
    problemType,
    currentSituation,
    expectedOutcome,
    preferredCommunication,
    locationType,
    isPopulationAffected,
    approxNoPeopleAffected,
    hasAffectedGroups,
    affectedGroups,
    impactAreas,
    impactDescription,
  } = req.body;

  // Required text fields
  const requiredFields = { title, category, problemType, preferredCommunication, locationType };
  for (const [name, value] of Object.entries(requiredFields)) {
    if (isBlank(value)) throw new ApiError(400, `${name} is required`);
  }

  const descriptionList = toTextList(description);
  if (descriptionList.length === 0) {
    throw new ApiError(400, "description is required");
  }

  //Booleans
  if (isBlank(isPopulationAffected) || isBlank(hasAffectedGroups)) {
    throw new ApiError(400, "isPopulationAffected and hasAffectedGroups are required");
  }
  const populationAffected = toBoolean(isPopulationAffected, "isPopulationAffected");
  const groupsAffected = toBoolean(hasAffectedGroups, "hasAffectedGroups");

  // Affected people / groups
  const peopleCount = populationAffected
    ? optionalNumber(approxNoPeopleAffected, "approxNoPeopleAffected")
    : 0;

  const groupsList = groupsAffected ? toStringList(affectedGroups) : [];
  if (groupsAffected && groupsList.length === 0) {
    throw new ApiError(400, "Select at least one affected group");
  }

  // location
  let { coordinates } = req.body;
  if (typeof coordinates === "string") {
    try {
      coordinates = JSON.parse(coordinates);
    } catch {
      coordinates = null;
    }
  }
  if (
    !Array.isArray(coordinates) ||
    coordinates.length !== 2 ||
    typeof coordinates[0] !== "number" ||
    typeof coordinates[1] !== "number"
  ) {
    throw new ApiError(400, "Valid coordinates [longitude, latitude] are required");
  }

  const impact = {
    areas: toStringList(impactAreas),
    description: isBlank(impactDescription) ? undefined : String(impactDescription).trim(),
  };

  const photoLocalPath = req.files?.problemPhoto?.[0]?.path;
  if (!photoLocalPath) {
    throw new ApiError(400, "Problem photo is required");
  }

  const problemPhoto = await uploadOnCloudinary(photoLocalPath);
  if (!problemPhoto?.url) {
    throw new ApiError(500, "Error occurred while uploading photo");
  }

  let problemVideo;
  const videoLocalPath = req.files?.problemVideo?.[0]?.path;
  if (videoLocalPath) {
    problemVideo = await uploadOnCloudinary(videoLocalPath);
    if (!problemVideo?.url) {
      throw new ApiError(500, "Error occurred while uploading video");
    }
  }


  let problem;
  try {
    problem = await Problem.create({
      title,
      description: descriptionList,
      category,
      subCategory: toStringList(subCategory),
      problemType,
      currentSituation: toTextList(currentSituation),
      expectedOutcome: toTextList(expectedOutcome),
      preferredCommunication,
      location: { type: "Point", coordinates },
      locationType,
      isPopulationAffected: populationAffected,
      approxNoPeopleAffected: peopleCount,
      hasAffectedGroups: groupsAffected,
      affectedGroups: groupsList,
      impact,
      problemPhoto: problemPhoto.url,
      problemVideo: problemVideo?.url,
      reportedBy: req.user._id,
    });
  } catch (err) {
    if (err.name === "ValidationError") {
      const msg = Object.values(err.errors).map((e) => e.message).join(", ");
      throw new ApiError(400, msg);
    }
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, problem, "Problem registered successfully"));
});

const updateProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }


  const filter = { _id: problemId, isDeleted: false, reportedBy: req.user._id };

  const existing = await Problem.findOne(filter).select("verificationStatus");
  if (!existing) {
    throw new ApiError(404, "Problem not found");
  }
  if (!["pending", "needs_revision"].includes(existing.verificationStatus)) {
    throw new ApiError(409, `A problem that is ${existing.verificationStatus} can no longer be edited`);
  }

  const body = req.body ?? {};
  const updatedFields = {};

  for (const field of ["title", "category", "problemType", "locationType", "preferredCommunication"]) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "string" || !value.trim()) {
      throw new ApiError(400, `${field} cannot be empty`);
    }
    updatedFields[field] = value.trim();
  }

  for (const field of ["description", "subCategory", "currentSituation", "expectedOutcome", "affectedGroups"]) {
    const value = body[field];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      throw new ApiError(400, `${field} must be an array`);
    }
    updatedFields[field] = value.map((i) => String(i).trim()).filter(Boolean);
  }

  for (const field of ["isPopulationAffected", "hasAffectedGroups"]) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      throw new ApiError(400, `${field} must be true or false`);
    }
    updatedFields[field] = value;
  }

  if (body.approxNoPeopleAffected !== undefined) {
    const n = Number(body.approxNoPeopleAffected);
    if (body.approxNoPeopleAffected === "" || body.approxNoPeopleAffected === null || Number.isNaN(n)) {
      throw new ApiError(400, "approxNoPeopleAffected must be a number");
    }
    updatedFields.approxNoPeopleAffected = n;
  }

  if (body.coordinates !== undefined) {
    const coords = body.coordinates;
    if (!Array.isArray(coords) || coords.length !== 2 || coords.some((c) => c === null || c === "" || Number.isNaN(Number(c)))) {
      throw new ApiError(400, "coordinates must be [longitude, latitude]");
    }
    updatedFields.location = { type: "Point", coordinates: coords.map(Number) };
  }

  if (body.impact !== undefined) {
    if (typeof body.impact !== "object" || body.impact === null || Array.isArray(body.impact)) {
      throw new ApiError(400, "impact must be an object { areas, description }");
    }
    if (body.impact.areas !== undefined) {
      if (!Array.isArray(body.impact.areas)) {
        throw new ApiError(400, "impact.areas must be an array");
      }
      updatedFields["impact.areas"] = body.impact.areas.map((i) => String(i).trim()).filter(Boolean);
    }
    if (body.impact.description !== undefined) {
      updatedFields["impact.description"] = String(body.impact.description).trim();
    }
  }

  if (Object.keys(updatedFields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }


  if (existing.verificationStatus === "needs_revision") {
    updatedFields.verificationStatus = "pending";
  }

  const problem = await Problem.findOneAndUpdate(
    filter,
    { $set: updatedFields },
    { new: true, runValidators: true }
  );

  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Problem updated successfully"));
});

const deleteProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }

  const { deleteReason } = req.body ?? {};
  if (typeof deleteReason !== "string" || !deleteReason.trim()) {
    throw new ApiError(400, "Delete reason is required");
  }

  const problem = await Problem.findOneAndUpdate(
    { _id: problemId, isDeleted: false, reportedBy: req.user._id },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
        deleteReason: deleteReason.trim(),
      },
    },
    { new: true }
  ).select("title isDeleted deletedAt deleteReason");

  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Problem deleted successfully"));
});

const trackProblem = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorised access");
  }

  const { problemId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid problem id");
  }

  const problem = await Problem.findOne({ _id: problemId, isDeleted: false })
    .select(
      "title category problemType locationType severity urgency verificationStatus isRejected rejectionReason rejectedAt reportedBy createdAt updatedAt"
    )
    .populate("reportedBy", "username fullName")
    .lean();

  if (!problem) {
    throw new ApiError(404, "Problem not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, problem, "Problem fetched successfully"));
});
export { registerProblem, trackProblem, deleteProblem, updateProblem };