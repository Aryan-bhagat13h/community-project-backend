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

export { registerProblem };