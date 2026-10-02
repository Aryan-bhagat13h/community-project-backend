import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Profile } from "../models/profile.models.js";
import { StudentProfile } from "../models/studentProfile.models.js"; 
import { ROLE_PROFILE_MODEL } from "../utils/role-profile.js";

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

export { createStudentProfile };