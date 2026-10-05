import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import { Profile } from '../models/profile.models.js';
import { FacultyProfile } from '../models/faculty-profile.models.js'; 
import { ROLE_PROFILE_MODEL } from '../models/role-profile.models.js';

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

const updateFacultyProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const profile = await Profile.findOne({ user: req.user._id });

  if (!profile) {
    throw new ApiError(404, "Profile not found");
  }

  if (!profile.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.faculty) {
    throw new ApiError(404, "Faculty profile not found");
  }

  const {
    facultyId, institution, department, designation,
    qualifications, expertise, researchInterests, subjects, mentorshipAreas,
    experience, availability, maxTeams, linkedin, profileUrl,
  } = req.body;

  const updatedFields = {};

  if (institution !== undefined) {
    const inst = String(institution).trim();
    if (!inst) {
      throw new ApiError(400, "Institution cannot be empty");
    }
    updatedFields.institution = inst;
  }

  const optionalStrings = { facultyId, linkedin, profileUrl, department, designation, availability };

  for (const [field, value] of Object.entries(optionalStrings)) {
    if (value !== undefined) {
      updatedFields[field] = optionalString(value);
    }
  }

  const numbers = { experience, maxTeams };
  for (const [field, value] of Object.entries(numbers)) {
    if (value !== undefined) {
      updatedFields[field] = optionalNumber(value, field);
    }
  }

  if (qualifications !== undefined) {
    updatedFields.qualifications = toStringList(qualifications);
  }
  if (expertise !== undefined) {
    updatedFields.expertise = toStringList(expertise);
  }
  if (researchInterests !== undefined) {
    updatedFields.researchInterests = toStringList(researchInterests);
  }
  if (subjects !== undefined) {
    updatedFields.subjects = toStringList(subjects);
  }
  if (mentorshipAreas !== undefined) {
    updatedFields.mentorshipAreas = toStringList(mentorshipAreas);
  }

  if (Object.keys(updatedFields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  let facultyProfile;
  try {
    facultyProfile = await FacultyProfile.findByIdAndUpdate(
      profile.roleProfile,
      { $set: updatedFields },
      { new: true, runValidators: true }
    );
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "This facultyId is already in use");
    }
    throw err;
  }

  if (!facultyProfile) {
    throw new ApiError(404, "Faculty profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, facultyProfile, "Faculty profile updated successfully"));
});

export { createFacultyProfile, updateFacultyProfile };