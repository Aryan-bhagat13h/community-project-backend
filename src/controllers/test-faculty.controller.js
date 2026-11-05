import { TestReport } from "../models/test-report.models.js";
import { ApiError } from "../utils/api-error";
import { asyncHandler } from "../utils/async-handler.js";
import {User} from '../models/user.models.js'
import { Profile } from "../models/profile.models.js";
import { TestReport } from "../models/test-report.models.js";
import { ApiResponse } from "../utils/api-response.js";

const getMentoredTeamIds = async (userId) => {
  const profile = await Profile.findOne({
    user: userId,
    roleProfileModel: "FacultyProfile",
  }).select("roleProfile");
  if (!profile?.roleProfile) return [];

  const faculty = await FacultyProfile.findOne({
    _id: profile.roleProfile,
    verificationStatus: "verified",
    isRequested: true,
    isRequestAccepted: true,
  }).select("requestedBy");

  return faculty?.requestedBy ? [faculty.requestedBy] : [];
};

const getAssignedTestReports = asyncHandler(async(req,res) => {

  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access");

  const teamIds = await getMentoredTeamIds(req.user._id);
  if (teamIds.length === 0) {
    return res
      .status(200)
      .json(new ApiResponse(200, [], "You are not mentoring any team yet"));
  }

  const visible = ["submitted", "under_review", "changes_requested", "approved", "rejected"];

  const filter = {
    team: { $in: teamIds },
    reviewStatus: { $in: visible },
    isDeleted: { $ne: true },
  };

  if (req.query.status) {
    const status = String(req.query.status);
    if (!visible.includes(status)) {
      throw new ApiError(400, "Invalid status filter");
    }
    filter.reviewStatus = status;
  }

  const reports = await TestReport.find(filter)
    .select(
      "title reviewStatus prototype project team submittedBy totalTests passedTests failedTests blockedTests submittedAt reviewedAt updatedAt"
    )
    .populate("prototype", "title version")
    .populate("project", "title name")
    .populate("team", "name")
    .populate("submittedBy", "fullname username")
    .sort({ updatedAt: -1 });

  return res
    .status(200)
    .json(new ApiResponse(200, reports, "Assigned test reports fetched successfully"));
  }
});

const getTestDetails = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { testReportId } = req.params;
  if (!mongoose.isValidObjectId(testReportId)) {
    throw new ApiError(400, "Invalid test report id");
  }

  const visible = ["submitted", "under_review", "changes_requested", "approved", "rejected"];
  const teamIds = await getMentoredTeamIds(req.user._id);

  const report = await TestReport.findOne({
    _id: testReportId,
    team: { $in: teamIds },
    reviewStatus: { $in: visible },
    isDeleted: { $ne: true },
  })
    .select("-__v -isDeleted -deletedAt -deletedBy -deleteReason -testEvidence.publicId")
    .populate("prototype", "title version reviewStatus")
    .populate("project", "title name")
    .populate("team", "name")
    .populate("submittedBy", "fullname username email")
    .populate("reviewer", "fullname username");

  if (!report) {
    throw new ApiError(404, "Test report not found");
  }

  const reviews = await TestReview.find({ testReport: report._id })
    .sort({ round: 1 })
    .populate("reviewer", "fullname username");

  return res
    .status(200)
    .json(new ApiResponse(200, { report, reviews }, "Test report fetched successfully"));
});

export {getAssignedTestReports, getTestDetails}