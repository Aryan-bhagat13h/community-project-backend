import mongoose, { Schema } from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Prototype } from "../models/prototype.models.js";
import { Team } from "../models/team.models.js";
import { TestReport } from "../models/test-report.models.js";

const OPEN_STATUSES = ["draft", "submitted", "under_review", "changes_requested"];

const text = (v) => 
  v === undefined || v === null ? undefined : String(v).trim();

const toList = (v, label, max) => {
  if (v === undefined || v === null) return [];
  
  const items = (Array.isArray(v) ? v : [v])
    .map((i) => String(i).trim())
    .filter(Boolean);

  if (items.length > max) {
    throw new ApiError(400, `${label} can have at most ${max} items`);
  }

  return items;
};

const toObjectList = (v, label, max, mapItem) => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ApiError(400, `${label} must be an array`);
  if (v.length > max) throw new ApiError(400, `${label} can have at most ${max} items`);

  return v.map((item, i) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      throw new ApiError(400, `${label}[${i}] must be an object`);
    }
    return mapItem(item);
  });
};

const createTestReport = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { prototypeId } = req.params;
  if (!mongoose.isValidObjectId(prototypeId)) {
    throw new ApiError(400, "Invalid prototype id");
  }

  const prototype = await Prototype.findById(prototypeId).select("project team reviewStatus");
  if (!prototype) {
    throw new ApiError(404, "Prototype not found");
  }
  const team = await Team.findById(prototype.team).select("leader teamMembers");
  const isMember =
    team &&
    (team.leader.equals(req.user._id) ||
      team.teamMembers.some((id) => id.equals(req.user._id)));
  if (!isMember) {
    throw new ApiError(403, "Only members of this prototype's team can create test reports");
  }

  if (prototype.reviewStatus === "rejected") {
    throw new ApiError(409, "Test reports cannot be created for a rejected prototype");
  }

  const hasOpenReport = await TestReport.exists({
    prototype: prototype._id,
    reviewStatus: { $in: OPEN_STATUSES },
  });
  if (hasOpenReport) {
    throw new ApiError(
      409,
      "This prototype already has an unfinished test report. Finish or delete it first"
    );
  }

  const { title, description, testingMethod, testingSummary } = req.body;

  if (!text(title)) {
    throw new ApiError(400, "Title is required");
  }

  const testCases = toObjectList(req.body.testCases, "testCases", 200, (c) => ({
    name: text(c.name),
    expectedResult: text(c.expectedResult),
    actualResult: text(c.actualResult),
    status: text(c.status)?.toLowerCase(),
  }));

  const bugsFound = toObjectList(req.body.bugsFound, "bugsFound", 100, (b) => ({
    description: text(b.description),
    severity: text(b.severity)?.toLowerCase(),
    status: text(b.status)?.toLowerCase(),
  }));

  const report = await TestReport.create({
    title: text(title),
    description: text(description),
    testingMethod: text(testingMethod),
    testingSummary: text(testingSummary),
    testCases,
    bugsFound,
    userFeedback: toList(req.body.userFeedback, "userFeedback", 50),
    limitations: toList(req.body.limitations, "limitations", 30),

    prototype: prototype._id,
    project: prototype.project,
    team: prototype.team,
    submittedBy: req.user._id,
    statusHistory: [{ status: "draft", by: req.user._id }],
  });

  return res
    .status(201)
    .json(new ApiResponse(201, report, "Test report draft created successfully"));
});

const updateTestReport = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { prototypeId, testId } = req.params;
  if (!mongoose.isValidObjectId(prototypeId) || !mongoose.isValidObjectId(testId)) {
    throw new ApiError(400, "Invalid id");
  }

  const prototype = await Prototype.findById(prototypeId).select("team");
  if (!prototype) {
    throw new ApiError(404, "Prototype not found");
  }

  // Only team members can edit
  const team = await Team.findById(prototype.team).select("leader teamMembers");
  const isMember =
    team &&
    (team.leader.equals(req.user._id) ||
      team.teamMembers.some((id) => id.equals(req.user._id)));
  if (!isMember) {
    throw new ApiError(403, "Only team members can update test reports");
  }

  const report = await TestReport.findOne({ _id: testId, prototype: prototype._id });
  if (!report) {
    throw new ApiError(404, "Test report not found");
  }

  // Only drafts and reports sent back for changes can be edited
  if (!["draft", "changes_requested"].includes(report.reviewStatus)) {
    throw new ApiError(409, "This report cannot be edited right now");
  }

  const allowed = [
    "title",
    "description",
    "testingMethod",
    "testingSummary",
    "testCases",
    "bugsFound",
    "userFeedback",
    "limitations",
  ];

  let changed = false;
  for (const field of allowed) {
    if (req.body[field] !== undefined) {
      report[field] = req.body[field];
      changed = true;
    }
  }

  if (!changed) {
    throw new ApiError(400, "Send at least one field to update");
  }

  await report.save();

  return res
    .status(200)
    .json(new ApiResponse(200, report, "Test report updated successfully"));
});

const DELETABLE_STATUSES = ["draft", "changes_requested", "rejected"];

const deleteTestReport = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { testReportId } = req.params;
  if (!mongoose.isValidObjectId(testReportId)) {
    throw new ApiError(400, "Invalid test report id");
  }

  const reason = String(req.body.deleteReason ?? "").trim();
  if (reason.length < 5) {
    throw new ApiError(400, "Deletion reason is required (at least 5 characters)");
  }
  if (reason.length > 500) {
    throw new ApiError(400, "Deletion reason cannot exceed 500 characters");
  }

  const report = await TestReport.findOne({
    _id: testReportId,
    isDeleted: { $ne: true },
  }).select("team reviewStatus");
  if (!report) {
    throw new ApiError(404, "Test report not found");
  }

  // Only the team leader can delete
  const team = await Team.findById(report.team).select("leader");
  if (!team || !team.leader.equals(req.user._id)) {
    throw new ApiError(403, "Only the team leader can delete test reports");
  }

  if (!DELETABLE_STATUSES.includes(report.reviewStatus)) {
    throw new ApiError(
      409,
      `A test report cannot be deleted while it is ${report.reviewStatus.replace(/_/g, " ")}`
    );
  }

  const deleted = await TestReport.findOneAndUpdate(
    {
      _id: report._id,
      isDeleted: { $ne: true },
      reviewStatus: { $in: DELETABLE_STATUSES },
    },
    {
      $set: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: req.user._id,
        deleteReason: reason,
      },
    },
    { new: true }
  ).select("title isDeleted deletedAt");

  if (!deleted) {
    throw new ApiError(409, "The test report changed while deleting. Please try again");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, deleted, "Test report deleted successfully"));
});

const getTestReport = asyncHandler(async (req, res) => {
  if (!req.user?._id) {
    throw new ApiError(401, "Unauthorized access");
  }

  const { testReportId } = req.params;
  if (!mongoose.isValidObjectId(testReportId)) {
    throw new ApiError(400, "Invalid test report id");
  }

  const report = await TestReport.findOne({
    _id: testReportId,
    isDeleted: { $ne: true },
  })
    .select("-__v -statusHistory -isDeleted -deletedAt -deletedBy -deleteReason -testEvidence.publicId")
    .populate("team", "name leader teamMembers")
    .populate("prototype", "title version reviewStatus")
    .populate("project", "title name")
    .populate("submittedBy", "fullname username")
    .populate("reviewer", "fullname username");

  if (!report) {
    throw new ApiError(404, "Test report not found");
  }

  // Only members of the report's team can view it
  const team = report.team;
  const isMember =
    team &&
    (team.leader.equals(req.user._id) ||
      team.teamMembers.some((id) => id.equals(req.user._id)));
  if (!isMember) {
    throw new ApiError(403, "Only team members can view this test report");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, report, "Test report fetched successfully"));
});

export { getTestReport };

export { createTestReport, updateTestReport, deleteTestReport, getTestReport };

