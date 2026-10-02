import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { Profile } from "../models/profile.models.js";
import { FacultyProfile } from "../models/facultyProfile.models.js"; 
import { ROLE_PROFILE_MODEL } from "../utils/role-profile.js";

const optionalString = (v) => (v === undefined ? undefined : String(v).trim());

const optionalNumber = (v, field) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) {
    throw new ApiError(400, `${field} must be a number`);
  }
  return n;
};


const toStringList = (v) => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.map((i) => String(i).trim()).filter(Boolean);
};

const createFacultyProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const {
    facultyId, institution, department, designation,
    qualifications, expertise, researchInterests, subjects, mentorshipAreas,
    experience, availability, maxTeams, linkedin, profileUrl,
  } = req.body;

  if (!institution || String(institution).trim() === "") {
    throw new ApiError(400, "Institution is required");
  }

  const profile = await Profile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Create your base profile first");
  }
  if (profile.roleProfile) {
    throw new ApiError(409, "Faculty profile already exists");
  }

  let facultyProfile;
  try {
    facultyProfile = await FacultyProfile.create({
      facultyId: optionalString(facultyId),
      institution: String(institution).trim(),
      department: optionalString(department),
      designation: optionalString(designation),
      qualifications: toStringList(qualifications),
      expertise: toStringList(expertise),
      researchInterests: toStringList(researchInterests),
      subjects: toStringList(subjects),
      mentorshipAreas: toStringList(mentorshipAreas),
      experience: optionalNumber(experience, "experience"),
      availability: optionalString(availability),
      maxTeams: optionalNumber(maxTeams, "maxTeams"),
      linkedin: optionalString(linkedin),
      profileUrl: optionalString(profileUrl),
      
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "This facultyId is already in use");
    }
    throw err;
  }

  try {
    profile.roleProfile = facultyProfile._id;
    profile.roleProfileModel = ROLE_PROFILE_MODEL.faculty;
    await profile.save();
  } catch (err) {
    await FacultyProfile.findByIdAndDelete(facultyProfile._id);
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, facultyProfile, "Faculty profile created successfully"));
});

export { createFacultyProfile };