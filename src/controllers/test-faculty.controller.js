import { TestReport } from "../models/test-report.models.js";
import { ApiError } from "../utils/api-error";
import { asyncHandler } from "../utils/async-handler.js";
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
  }

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
);

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

const REVIEWABLE = ["submitted", "under_review"];
const MENTOR_VISIBLE = ["submitted", "under_review", "changes_requested", "approved", "rejected"];

const cleanList = (v) =>
  Array.isArray(v) ? v.map((i) => String(i).trim()).filter(Boolean) : [];

const loadReportToReview = async (req) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { testReportId } = req.params;
  if (!mongoose.isValidObjectId(testReportId)) {
    throw new ApiError(400, "Invalid test report id");
  }

  const teamIds = await getMentoredTeamIds(req.user._id);
  const report = await TestReport.findOne({
    _id: testReportId,
    team: { $in: teamIds },
    reviewStatus: { $in: MENTOR_VISIBLE },
    isDeleted: { $ne: true },
  }).select("team project reviewStatus");

  if (!report) {
    throw new ApiError(404, "Test report not found");
  }
  if (!REVIEWABLE.includes(report.reviewStatus)) {
    throw new ApiError(409, `This report is already ${report.reviewStatus.replace(/_/g, " ")}`);
  }
  return report;
};

const saveTestDecision = async (req, res, decision, message) => {
  const report = await loadReportToReview(req);
  const body = req.body;

  const feedback = String(body.feedback ?? "").trim();
  const round = (await TestReview.countDocuments({ testReport: report._id })) + 1;

  let review;
  try {
    review = await TestReview.create({
      testReport: report._id,
      project: report.project,
      reviewer: req.user._id,
      round,
      decision,
      testingMethodScore: body.testingMethodScore,
      testCoverageScore: body.testCoverageScore,
      resultAccuracyScore: body.resultAccuracyScore,
      evidenceScore: body.evidenceScore,
      feedback: feedback || undefined,
      suggestions: cleanList(body.suggestions),
      requiredChanges: decision === "changes_requested" ? cleanList(body.requiredChanges) : [],
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "This report was just reviewed by someone else");
    }
    throw err;
  }

  const set = { reviewStatus: decision, reviewer: req.user._id, reviewedAt: new Date() };
  const update = review.feedback
    ? { $set: { ...set, reviewFeedback: review.feedback } }
    : { $set: set, $unset: { reviewFeedback: "" } };

  const updated = await TestReport.findOneAndUpdate(
    { _id: report._id, reviewStatus: { $in: REVIEWABLE } },
    update,
    { new: true }
  ).select("title reviewStatus reviewer reviewedAt reviewFeedback");

  if (!updated) {
    await TestReview.deleteOne({ _id: review._id });
    throw new ApiError(409, "The report changed while saving the review. Please reload");
  }

  return res.status(200).json(new ApiResponse(200, { report: updated, review }, message));
};

const reviewTestReport = asyncHandler(async (req, res) => {
  const report = await loadReportToReview(req);

  if (report.reviewStatus === "under_review") {
    return res
      .status(200)
      .json(new ApiResponse(200, { reviewStatus: "under_review" }, "Review already in progress"));
  }

  const updated = await TestReport.findOneAndUpdate(
    { _id: report._id, reviewStatus: "submitted" },
    { $set: { reviewStatus: "under_review", reviewer: req.user._id } },
    { new: true }
  ).select("title reviewStatus reviewer");

  if (!updated) {
    throw new ApiError(409, "The report changed. Please reload and try again");
  }

  return res.status(200).json(new ApiResponse(200, updated, "Review started"));
});

const approveTestReport = asyncHandler(async (req, res) =>
  saveTestDecision(req, res, "approved", "Test report approved successfully")
);

const requestTestChanges = asyncHandler(async (req, res) =>
  saveTestDecision(req, res, "changes_requested", "Changes requested successfully")
);

const rejectTestReport = asyncHandler(async (req, res) =>
  saveTestDecision(req, res, "rejected", "Test report rejected")
);

const getTestReviewHistory = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { testReportId } = req.params;
  if (!mongoose.isValidObjectId(testReportId)) {
    throw new ApiError(400, "Invalid test report id");
  }

  const teamIds = await getMentoredTeamIds(req.user._id);

  const report = await TestReport.findOne({
    _id: testReportId,
    team: { $in: teamIds },
    reviewStatus: { $in: MENTOR_VISIBLE },
    isDeleted: { $ne: true },
  }).select("title reviewStatus");

  if (!report) {
    throw new ApiError(404, "Test report not found");
  }

  const reviews = await TestReview.find({ testReport: report._id })
    .sort({ round: 1 })
    .populate("reviewer", "fullname username");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        title: report.title,
        currentStatus: report.reviewStatus,
        totalRounds: reviews.length,
        reviews,
      },
      reviews.length ? "Review history fetched successfully" : "No reviews yet"
    )
  );
});

export {getAssignedTestReports, getTestDetails, reviewTestReport, approveTestReport, requestTestChanges, rejectTestReport, getTestReviewHistory}