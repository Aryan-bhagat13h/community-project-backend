import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Profile } from '../models/profile.models.js'
import {StudentProfile} from '../models/student-profile.models.js'
import { ROLE_PROFILE_MODEL } from "../models/role-profile.models.js"

const optionalString = (v) => (v === undefined ? undefined : String(v).trim());

const optionalNumber = (v, field) => {
  if (v === undefined || v === "") return undefined;
  const n = Number(v);
  if (Number.isNaN(n)) throw new ApiError(400, `${field} must be a number`);
  return n;
};

const toStringList = (v) =>
  Array.isArray(v) ? v.map((i) => String(i).trim()).filter(Boolean) : [];

const createStudentProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const {
    studentId, college, department, degree,
    currentYear, currentSemester, graduationYear,
    skills, interests, researchInterests, preferredDomains,
    github, linkedin, portfolio,
  } = req.body;

  for (const [field, value] of Object.entries({ college, department, degree })) {
    if (!value || String(value).trim() === "") {
      throw new ApiError(400, `${field} is required`);
    }
  }

  const profile = await Profile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Create your base profile first");
  }
  if (profile.roleProfile) {
    throw new ApiError(409, "Student profile already exists");
  }


  const cleanSkills = Array.isArray(skills)
    ? skills
        .filter((s) => s?.name && String(s.name).trim())
        .map((s) => ({ name: String(s.name).trim(), level: s.level }))
    : [];

  const studentProfile = await StudentProfile.create({
    studentId: optionalString(studentId),
    college: college.trim(),
    department: department.trim(),
    degree: degree.trim(),
    currentYear: optionalNumber(currentYear, "currentYear"),
    currentSemester: optionalNumber(currentSemester, "currentSemester"),
    graduationYear: optionalNumber(graduationYear, "graduationYear"),
    skills: cleanSkills,
    interests: toStringList(interests),
    researchInterests: toStringList(researchInterests),
    preferredDomains: toStringList(preferredDomains),
    github: optionalString(github),
    linkedin: optionalString(linkedin),
    portfolio: optionalString(portfolio),
  });


  try {
    profile.roleProfile = studentProfile._id;
    profile.roleProfileModel = ROLE_PROFILE_MODEL.student;
    await profile.save();
  } catch (err) {
    await StudentProfile.findByIdAndDelete(studentProfile._id);
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, studentProfile, "Student profile created successfully"));
});

const updateStudentProfile = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

 
  const profile = await Profile.findOne({ user: req.user._id });
  if (!profile) {
    throw new ApiError(404, "Profile not found");
  }
  if (!profile.roleProfile || profile.roleProfileModel !== ROLE_PROFILE_MODEL.student) {
    throw new ApiError(404, "Student profile not found");
  }

  const {
    studentId, college, department, degree,
    currentYear, currentSemester, graduationYear,
    skills, interests, researchInterests, preferredDomains,
    github, linkedin, portfolio,
  } = req.body;

  const updatedFields = {};

  for (const [field, value] of Object.entries({ college, department, degree })) {
    if (value !== undefined) {
      const v = String(value).trim();
      if (!v) throw new ApiError(400, `${field} cannot be empty`);
      updatedFields[field] = v;
    }
  }

 
  const optionalStrings = { studentId, github, linkedin, portfolio };
  for (const [field, value] of Object.entries(optionalStrings)) {
    if (value !== undefined) updatedFields[field] = optionalString(value);
  }

  const numbers = { currentYear, currentSemester, graduationYear };
  for (const [field, value] of Object.entries(numbers)) {
    if (value !== undefined) updatedFields[field] = optionalNumber(value, field);
  }

  if (interests !== undefined) updatedFields.interests = toStringList(interests);
  if (researchInterests !== undefined) updatedFields.researchInterests = toStringList(researchInterests);
  if (preferredDomains !== undefined) updatedFields.preferredDomains = toStringList(preferredDomains);

  if (skills !== undefined) {
    if (!Array.isArray(skills)) {
      throw new ApiError(400, "skills must be an array of { name, level }");
    }
    updatedFields.skills = skills
      .filter((s) => s?.name && String(s.name).trim())
      .map((s) => ({ name: String(s.name).trim(), level: s.level }));
  }

  if (Object.keys(updatedFields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  let studentProfile;
  try {
    studentProfile = await StudentProfile.findByIdAndUpdate(
      profile.roleProfile,
      { $set: updatedFields },
      { new: true, runValidators: true } 
    );
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "This studentId is already in use");
    }
    throw err;
  }

  if (!studentProfile) {
    throw new ApiError(404, "Student profile not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, studentProfile, "Student profile updated successfully"));
});

export { createStudentProfile, updateStudentProfile };
