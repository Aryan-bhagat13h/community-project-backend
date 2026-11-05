import { TestReport } from "../models/test-report.models.js";
import { ApiError } from "../utils/api-error";
import { asyncHandler } from "../utils/async-handler.js";
import { Profile } from "../models/profile.models.js";
import { TestReport } from "../models/test-report.models.js";
import { ApiResponse } from "../utils/api-response.js";
import {User} from '../models/user.models.js'

const ALL_STATUSES = ["draft", "submitted", "under_review", "changes_requested", "approved", "rejected"];
const REVIEWABLE = ["submitted", "under_review"];
const ASSIGNABLE = ["submitted", "under_review", "changes_requested"];

const r2 = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : null);

const checkId = (value, label) => {
  if (!mongoose.isValidObjectId(value)) throw new ApiError(400, `Invalid ${label}`);
  return String(value);
};

const dateRange = (q) => {
  const range = {};
  if (q.from) {
    const from = new Date(String(q.from));
    if (Number.isNaN(from.getTime())) throw new ApiError(400, "from must be a valid date");
    range.$gte = from;
  }
  if (q.to) {
    const to = new Date(String(q.to));
    if (Number.isNaN(to.getTime())) throw new ApiError(400, "to must be a valid date");
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(q.to))) to.setUTCHours(23, 59, 59, 999); // whole day
    range.$lte = to;
  }
  return Object.keys(range).length ? range : undefined;
};

const loadVerifiedFaculty = async (reviewerId) => {
  checkId(reviewerId, "reviewer id");

  const user = await User.findById(reviewerId).select("fullname username role");
  if (!user || user.role !== "faculty") {
    throw new ApiError(404, "Faculty member not found");
  }

  const profile = await Profile.findOne({
    user: user._id,
    roleProfileModel: "FacultyProfile",
  }).select("roleProfile");

  const verified =
    profile?.roleProfile &&
    (await FacultyProfile.exists({ _id: profile.roleProfile, verificationStatus: "verified" }));
  if (!verified) {
    throw new ApiError(400, "This faculty member is not verified");
  }
  return user;
};

const findAssignableReport = async (req) => {
  const testReportId = checkId(req.params.testReportId, "test report id");

  const report = await TestReport.findOne({
    _id: testReportId,
    isDeleted: { $ne: true },
  }).select("title reviewStatus reviewer reviewerAssignedBy");

  if (!report) {
    throw new ApiError(404, "Test report not found");
  }
  if (!ASSIGNABLE.includes(report.reviewStatus)) {
    throw new ApiError(
      409,
      `A reviewer cannot be changed while the report is ${report.reviewStatus.replace(/_/g, " ")}`
    );
  }
  return report;
};

const getAllTestReports = asyncHandler(async (req, res) => {
  const q = req.query;
  const filter = {};

  if (q.status) {
    const status = String(q.status);
    if (!ALL_STATUSES.includes(status)) throw new ApiError(400, "Invalid status filter");
    filter.reviewStatus = status;
  }
  if (q.prototype) filter.prototype = checkId(String(q.prototype), "prototype id");
  if (q.project) filter.project = checkId(String(q.project), "project id");
  if (q.team) filter.team = checkId(String(q.team), "team id");

  if (q.reviewer) {
    filter.reviewer = checkId(String(q.reviewer), "reviewer id");
  } else if (String(q.unassigned) === "true") {
    filter.reviewer = null; // no reviewer recorded yet
  }

  const created = dateRange(q);
  if (created) filter.createdAt = created;

  const deletedMode = String(q.deleted || "exclude");
  if (!["exclude", "include", "only"].includes(deletedMode)) {
    throw new ApiError(400, "deleted must be exclude, include or only");
  }
  if (deletedMode === "exclude") filter.isDeleted = { $ne: true };
  if (deletedMode === "only") filter.isDeleted = true;

  const page = Math.max(parseInt(q.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), 100);

  const find = TestReport.find(filter)
    .select(
      "title reviewStatus prototype project team submittedBy reviewer totalTests passedTests failedTests blockedTests submittedAt reviewedAt isDeleted updatedAt"
    )
    .populate("prototype", "title version")
    .populate("project", "title name")
    .populate("team", "name")
    .populate("submittedBy", "fullname username")
    .populate("reviewer", "fullname username")
    .sort({ updatedAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const count = TestReport.countDocuments(filter);

  if (deletedMode !== "exclude") {
    find.setOptions({ includeDeleted: true });
    count.setOptions({ includeDeleted: true });
  }

  const [reports, total] = await Promise.all([find, count]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { reports, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
      "Test reports fetched successfully"
    )
  );
});

const getTestReportDetails = asyncHandler(async (req, res) => {
  const testReportId = checkId(req.params.testReportId, "test report id");

  const report = await TestReport.findById(testReportId)
    .setOptions({ includeDeleted: true })
    .select("-__v -testEvidence.publicId")
    .populate("prototype", "title version reviewStatus")
    .populate("project", "title name")
    .populate({
      path: "team",
      select: "name leader teamMembers",
      populate: [
        { path: "leader", select: "fullname username email" },
        { path: "teamMembers", select: "fullname username email" },
      ],
    })
    .populate("submittedBy", "fullname username email")
    .populate("reviewer", "fullname username email")
    .populate("reviewerAssignedBy", "fullname username")
    .populate("deletedBy", "fullname username");

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

const assignTestReviewer = asyncHandler(async (req, res) => {
  const report = await findAssignableReport(req);

  if (report.reviewerAssignedBy) {
    throw new ApiError(409, "A reviewer was already assigned. Use the reassign endpoint to change it");
  }

  const faculty = await loadVerifiedFaculty(req.body.reviewerId);

  const updated = await TestReport.findOneAndUpdate(
    { _id: report._id, reviewStatus: { $in: ASSIGNABLE }, reviewerAssignedBy: null },
    {
      $set: {
        reviewer: faculty._id,
        reviewerAssignedBy: req.user._id,
        reviewerAssignedAt: new Date(),
      },
    },
    { new: true }
  )
    .select("title reviewStatus reviewer reviewerAssignedAt")
    .populate("reviewer", "fullname username");

  if (!updated) {
    throw new ApiError(409, "The report changed while assigning. Please reload and try again");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updated, `Reviewer assigned: ${faculty.fullname}`));
});

const reassignTestReviewer = asyncHandler(async (req, res) => {
  const report = await findAssignableReport(req);

  if (!report.reviewerAssignedBy || !report.reviewer) {
    throw new ApiError(409, "No reviewer was assigned yet. Use the assign endpoint instead");
  }

  const reason = String(req.body.reason ?? "").trim();
  if (reason.length < 5) {
    throw new ApiError(400, "Reason is required (at least 5 characters)");
  }

  const faculty = await loadVerifiedFaculty(req.body.reviewerId);
  if (report.reviewer.equals(faculty._id)) {
    throw new ApiError(400, "This faculty member is already the reviewer");
  }

  const updated = await TestReport.findOneAndUpdate(
    { _id: report._id, reviewStatus: { $in: ASSIGNABLE }, reviewer: report.reviewer },
    {
      $set: {
        reviewer: faculty._id,
        reviewerAssignedBy: req.user._id,
        reviewerAssignedAt: new Date(),
      },
    },
    { new: true }
  )
    .select("title reviewStatus reviewer reviewerAssignedAt")
    .populate("reviewer", "fullname username");

  if (!updated) {
    throw new ApiError(409, "The report changed while reassigning. Please reload and try again");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, updated, `Review transferred to ${faculty.fullname}`));
});

const getTestingStatistics = asyncHandler(async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months, 10) || 6, 1), 24);
  const since = new Date();
  since.setMonth(since.getMonth() - (months - 1));
  since.setDate(1);
  since.setHours(0, 0, 0, 0);

  const [data] = await TestReport.aggregate([
    { $match: { isDeleted: { $ne: true } } },
    {
      $facet: {
        byStatus: [{ $group: { _id: "$reviewStatus", count: { $sum: 1 } } }],
        pending: [
          { $match: { reviewStatus: { $in: REVIEWABLE } } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              noReviewerYet: { $sum: { $cond: [{ $ifNull: ["$reviewer", false] }, 0, 1] } },
              oldestSubmittedAt: { $min: "$submittedAt" },
            },
          },
        ],
        passRate: [
          { $match: { reviewStatus: { $ne: "draft" }, totalTests: { $gt: 0 } } },
          {
            $group: {
              _id: null,
              avg: { $avg: { $divide: ["$passedTests", "$totalTests"] } },
              reports: { $sum: 1 },
            },
          },
        ],
        bugs: [
          { $match: { reviewStatus: { $ne: "draft" } } },
          { $unwind: "$bugsFound" },
          {
            $group: {
              _id: { severity: "$bugsFound.severity", status: "$bugsFound.status" },
              count: { $sum: 1 },
            },
          },
        ],
        turnaround: [
          { $match: { reviewedAt: { $exists: true }, submittedAt: { $exists: true } } },
          {
            $group: {
              _id: null,
              avgMs: { $avg: { $subtract: ["$reviewedAt", "$submittedAt"] } },
              reviewed: { $sum: 1 },
            },
          },
        ],
        monthly: [
          { $match: { submittedAt: { $gte: since } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m", date: "$submittedAt" } },
              submitted: { $sum: 1 },
              approved: { $sum: { $cond: [{ $eq: ["$reviewStatus", "approved"] }, 1, 0] } },
              rejected: { $sum: { $cond: [{ $eq: ["$reviewStatus", "rejected"] }, 1, 0] } },
              changesRequested: {
                $sum: { $cond: [{ $eq: ["$reviewStatus", "changes_requested"] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
        ],
      },
    },
  ]);

  const [scores] = await TestReview.aggregate([
    {
      $group: {
        _id: null,
        reviews: { $sum: 1 },
        testingMethod: { $avg: "$testingMethodScore" },
        testCoverage: { $avg: "$testCoverageScore" },
        resultAccuracy: { $avg: "$resultAccuracyScore" },
        evidence: { $avg: "$evidenceScore" },
        overall: { $avg: "$overallScore" },
      },
    },
  ]);

  const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0]));
  for (const row of data.byStatus) byStatus[row._id] = row.count;

  const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
  const decided = byStatus.approved + byStatus.rejected;
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);

  const bugsBySeverity = { low: 0, medium: 0, high: 0, critical: 0 };
  let openBugs = 0;
  for (const row of data.bugs) {
    bugsBySeverity[row._id.severity] = (bugsBySeverity[row._id.severity] || 0) + row.count;
    if (row._id.status === "open") openBugs += row.count;
  }

  const pending = data.pending[0];
  const turnaround = data.turnaround[0];
  const passRate = data.passRate[0];

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totals: { all: total, submittedEver: total - byStatus.draft },
        byStatus,
        outcomes: {
          approved: byStatus.approved,
          rejected: byStatus.rejected,
          changesRequested: byStatus.changes_requested,
          approvalRatePercent: pct(byStatus.approved, decided),
          rejectionRatePercent: pct(byStatus.rejected, decided),
        },
        pending: {
          total: pending?.total || 0,
          noReviewerYet: pending?.noReviewerYet || 0,
          oldestSubmittedAt: pending?.oldestSubmittedAt || null,
        },
        averagePassRatePercent: passRate ? Math.round(passRate.avg * 1000) / 10 : null,
        bugs: { bySeverity: bugsBySeverity, stillOpen: openBugs },
        reviewScores: scores
          ? {
              reviews: scores.reviews,
              testingMethod: r2(scores.testingMethod),
              testCoverage: r2(scores.testCoverage),
              resultAccuracy: r2(scores.resultAccuracy),
              evidence: r2(scores.evidence),
              overall: r2(scores.overall),
            }
          : null,
        reviewTurnaround: {
          reviewedCount: turnaround?.reviewed || 0,
          averageDays: turnaround ? Math.round((turnaround.avgMs / 86400000) * 10) / 10 : null,
        },
        monthly: data.monthly.map(({ _id, ...rest }) => ({ month: _id, ...rest })),
        monthsCovered: months,
      },
      "Testing statistics fetched successfully"
    )
  );
});

export {getAllTestReports, getTestReportDetails, assignTestReviewer, reassignTestReviewer, getTestingStatistics}