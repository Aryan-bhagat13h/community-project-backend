import fs from "fs/promises";
import mongoose from "mongoose";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { Prototype } from "../models/prototype.models.js";
import { Project } from "../models/project.models.js";
import { Team } from "../models/team.models.js";
import { Profile } from "../models/profile.models.js";
import { FacultyProfile } from "../models/facultyProfile.models.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";


const EDITABLE = ["draft", "changes_requested"];
const OPEN = ["draft", "submitted", "under_review", "changes_requested"];
const STATUSES = ["draft", "submitted", "under_review", "changes_requested", "approved", "rejected"];

const TEXT_FIELDS = ["title", "description", "type", "testingSummary", "testingResults"];
const URL_FIELDS = ["demoUrl", "repositoryUrl", "readmeUrl", "architectureUrl", "demoVideo"];
const LIST_FIELDS = ["technologies", "completedFeatures", "partiallyCompletedFeatures", "plannedFeatures"];

const ATTACHMENT_KINDS = ["screenshot", "video", "diagram", "document", "file"];
const MAX_ITEMS = 10;

const requireUser = (req) => {
  if (!req.user?._id) throw new ApiError(401, "Unauthorized access");
};

const assertId = (id, label) => {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, `Invalid ${label}`);
};

const toStringList = (v) => {
  const arr = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return arr.map((i) => String(i).trim()).filter(Boolean);
};

const pickFields = (body = {}) => {
  const out = {};
  for (const f of [...TEXT_FIELDS, ...URL_FIELDS]) {
    if (body[f] === undefined) continue;
    let v = String(body[f]).trim();
    if (f === "type") v = v.toLowerCase();
    out[f] = v === "" ? undefined : v;
  }
  for (const f of LIST_FIELDS) {
    if (body[f] !== undefined) out[f] = toStringList(body[f]);
  }
  return out;
};

const isTeamMember = (team, userId) =>
  team.leader.equals(userId) || team.teamMembers.some((id) => id.equals(userId));

const assertEditable = (prototype) => {
  if (!EDITABLE.includes(prototype.reviewStatus)) {
    throw new ApiError(
      409,
      `Prototype cannot be edited while it is ${prototype.reviewStatus.replace(/_/g, " ")}`
    );
  }
};

const removeLocalFiles = async (files = []) => {
  await Promise.all(files.map((f) => fs.unlink(f.path).catch(() => {})));
};

const deleteCloudFiles = async (items = []) => {
  await Promise.all(
    items.map((i) => deleteFromCloudinary(i.publicId, i.resourceType || "image"))
  );
};

const getAccess = async (user, teamId) => {
  if (user.role === "admin") return "admin";

  const team = await Team.findById(teamId).select("leader teamMembers");
  if (team && isTeamMember(team, user._id)) return "member";

  if (user.role === "faculty") {
    const profile = await Profile.findOne({
      user: user._id,
      roleProfileModel: "FacultyProfile",
    }).select("roleProfile");

    if (profile?.roleProfile) {
      const isMentor = await FacultyProfile.exists({
        _id: profile.roleProfile,
        requestedBy: teamId,
        isRequested: true,
        isRequestAccepted: true,
      });
      if (isMentor) return "mentor";
    }
  }
  return null;
};

const findMentorUserId = async (teamId) => {
  const faculty = await FacultyProfile.findOne({
    requestedBy: teamId,
    isRequested: true,
    isRequestAccepted: true,
  }).select("_id");
  if (!faculty) return null;

  const profile = await Profile.findOne({
    roleProfile: faculty._id,
    roleProfileModel: "FacultyProfile",
  }).select("user");
  return profile?.user || null;
};

const loadForMember = async (req, { leaderOnly = false } = {}) => {
  requireUser(req);
  const { prototypeId } = req.params;
  assertId(prototypeId, "prototype id");

  const prototype = await Prototype.findById(prototypeId);
  if (!prototype) throw new ApiError(404, "Prototype not found");

  const team = await Team.findById(prototype.team).select("leader teamMembers");
  if (!team || !isTeamMember(team, req.user._id)) {
    throw new ApiError(403, "You are not a member of this prototype's team");
  }
  if (leaderOnly && !team.leader.equals(req.user._id)) {
    throw new ApiError(403, "Only the team leader can do this");
  }
  return { prototype, team };
};

const loadForRead = async (req) => {
  requireUser(req);
  const { prototypeId } = req.params;
  assertId(prototypeId, "prototype id");

  const prototype = await Prototype.findById(prototypeId);
  if (!prototype) throw new ApiError(404, "Prototype not found");

  const access = await getAccess(req.user, prototype.team);
  if (!access) throw new ApiError(403, "You do not have access to this prototype");

  if (access === "mentor" && prototype.reviewStatus === "draft") {
    throw new ApiError(403, "This prototype has not been submitted yet");
  }
  return { prototype, access };
};

const createPrototype = asyncHandler(async (req, res) => {
  requireUser(req);
  const { projectId } = req.params;
  assertId(projectId, "project id");

  const project = await Project.findById(projectId).select("team");
  if (!project) throw new ApiError(404, "Project not found");

  const team = await Team.findById(project.team).select("leader teamMembers");
  if (!team || !isTeamMember(team, req.user._id)) {
    throw new ApiError(403, "Only members of the project's team can create prototypes");
  }

  const fields = pickFields(req.body);
  if (!fields.title || !fields.type) {
    throw new ApiError(400, "title and type are required");
  }

  const hasOpen = await Prototype.exists({ project: project._id, reviewStatus: { $in: OPEN } });
  if (hasOpen) {
    throw new ApiError(
      409,
      "This project already has an unfinished prototype. Finish or delete it before creating a new version"
    );
  }

  const latest = await Prototype.findOne({ project: project._id })
    .sort({ version: -1 })
    .select("version")
    .lean();
  const version = (latest?.version || 0) + 1;

  let prototype;
  try {
    prototype = await Prototype.create({
      ...fields,
      project: project._id,
      team: team._id,
      submittedBy: req.user._id,
      version,
      statusHistory: [{ status: "draft", by: req.user._id }],
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(409, "Another version was just created. Please try again");
    }
    throw err;
  }

  return res
    .status(201)
    .json(new ApiResponse(201, prototype, "Prototype draft created successfully"));
});


const updatePrototype = asyncHandler(async (req, res) => {
  const { prototype } = await loadForMember(req);
  assertEditable(prototype);

  const fields = pickFields(req.body);
  if (Object.keys(fields).length === 0) {
    throw new ApiError(400, "Provide at least one field to update");
  }

  prototype.set(fields);
  await prototype.save();
  return res
    .status(200)
    .json(new ApiResponse(200, prototype, "Prototype updated successfully"));
});


const deletePrototype = asyncHandler(async (req, res) => {
  const { prototype } = await loadForMember(req, { leaderOnly: true });

  if (prototype.reviewStatus !== "draft") {
    throw new ApiError(409, "Only draft prototypes can be deleted");
  }

  const deleted = await Prototype.findOneAndDelete({
    _id: prototype._id,
    reviewStatus: "draft",
  });
  if (!deleted) {
    throw new ApiError(409, "Prototype is no longer a draft");
  }

  await deleteCloudFiles([...deleted.screenshots, ...deleted.attachments]);

  return res.status(200).json(new ApiResponse(200, null, "Prototype deleted successfully"));
});


const getPrototype = asyncHandler(async (req, res) => {
  const { prototype } = await loadForRead(req);

  await prototype.populate([
    { path: "project", select: "title name" },
    { path: "team", select: "name" },
    { path: "submittedBy", select: "fullname username" },
    { path: "reviewer", select: "fullname username" },
  ]);

  return res
    .status(200)
    .json(new ApiResponse(200, prototype, "Prototype fetched successfully"));
});


const getMyPrototypes = asyncHandler(async (req, res) => {
  requireUser(req);

  const uid = req.user._id;
  const teams = await Team.find({ $or: [{ teamMembers: uid }, { leader: uid }] }).select("_id");
  const teamIds = teams.map((t) => t._id);

  const filter = { team: { $in: teamIds } };

  if (req.query.status) {
    const status = String(req.query.status);
    if (!STATUSES.includes(status)) throw new ApiError(400, "Invalid status filter");
    filter.reviewStatus = status;
  }

  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);

  const [prototypes, total] = await Promise.all([
    Prototype.find(filter)
      .select("title version type reviewStatus project team submittedAt reviewedAt updatedAt")
      .populate("project", "title name")
      .populate("team", "name")
      .sort({ updatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Prototype.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { prototypes, pagination: { page, limit, total, pages: Math.ceil(total / limit) } },
      "Prototypes fetched successfully"
    )
  );
});


const getProjectPrototypes = asyncHandler(async (req, res) => {
  requireUser(req);
  const { projectId } = req.params;
  assertId(projectId, "project id");

  const project = await Project.findById(projectId).select("team");
  if (!project) throw new ApiError(404, "Project not found");

  const access = await getAccess(req.user, project.team);
  if (!access) throw new ApiError(403, "You do not have access to this project");

  const filter = { project: project._id };
  if (access === "mentor") filter.reviewStatus = { $ne: "draft" };

  const prototypes = await Prototype.find(filter)
    .select("title version type reviewStatus submittedAt reviewedAt updatedAt")
    .sort({ version: -1 })
    .lean();

  return res
    .status(200)
    .json(new ApiResponse(200, prototypes, "Project prototypes fetched successfully"));
});



const uploadPrototypeAttachment = asyncHandler(async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : [];
  const uploaded = [];

  try {
    const { prototype } = await loadForMember(req);
    assertEditable(prototype);

    if (files.length === 0) throw new ApiError(400, "At least one file is required");

    const kind = String(req.body.kind || "").trim().toLowerCase();
    if (!ATTACHMENT_KINDS.includes(kind)) {
      throw new ApiError(400, `kind must be one of: ${ATTACHMENT_KINDS.join(", ")}`);
    }

    for (const f of files) {
      if (kind === "screenshot" && !f.mimetype.startsWith("image/")) {
        throw new ApiError(400, "Screenshots must be image files");
      }
      if (kind === "video" && !f.mimetype.startsWith("video/")) {
        throw new ApiError(400, "Videos must be video files");
      }
    }

    const field = kind === "screenshot" ? "screenshots" : "attachments";
    if (prototype[field].length + files.length > MAX_ITEMS) {
      throw new ApiError(400, `A prototype can have at most ${MAX_ITEMS} ${field}`);
    }

    for (const f of files) {
      const result = await uploadOnCloudinary(f.path);
      const url = result?.secure_url || result?.url;
      if (!url) throw new ApiError(500, "Error occurred while uploading a file");

      uploaded.push({
        url,
        publicId: result.public_id,
        resourceType: result.resource_type || "image",
        ...(field === "attachments" && { name: f.originalname.slice(0, 100), kind }),
      });
    }

    const updated = await Prototype.findOneAndUpdate(
      {
        _id: prototype._id,
        reviewStatus: { $in: EDITABLE },
        [`${field}.${MAX_ITEMS - uploaded.length}`]: { $exists: false },
      },
      { $push: { [field]: { $each: uploaded } } },
      { new: true }
    ).select("screenshots attachments reviewStatus");

    if (!updated) {
      throw new ApiError(409, "Prototype changed while uploading. Please try again");
    }

    return res
      .status(201)
      .json(new ApiResponse(201, updated, "Files uploaded successfully"));
  } catch (err) {
    await deleteCloudFiles(uploaded);
    throw err;
  } finally {
    await removeLocalFiles(files);
  }
});


const deletePrototypeAttachment = asyncHandler(async (req, res) => {
  const { prototype } = await loadForMember(req);
  assertEditable(prototype);

  const { attachmentId } = req.params;
  assertId(attachmentId, "attachment id");

  const screenshot = prototype.screenshots.id(attachmentId);
  const attachment = prototype.attachments.id(attachmentId);
  const item = screenshot || attachment;
  if (!item) throw new ApiError(404, "Attachment not found");

  const field = screenshot ? "screenshots" : "attachments";

  const updated = await Prototype.findOneAndUpdate(
    { _id: prototype._id, reviewStatus: { $in: EDITABLE } },
    { $pull: { [field]: { _id: attachmentId } } },
    { new: true }
  ).select("screenshots attachments");

  if (!updated) {
    throw new ApiError(409, "Prototype changed while deleting. Please try again");
  }

  await deleteCloudFiles([item]); 

  return res
    .status(200)
    .json(new ApiResponse(200, updated, "Attachment removed successfully"));
});


const submitPrototype = asyncHandler(async (req, res) => {
  const { prototype } = await loadForMember(req, { leaderOnly: true });

  if (prototype.reviewStatus === "changes_requested") {
    throw new ApiError(409, "Use the resubmit endpoint after making the requested changes");
  }
  if (prototype.reviewStatus !== "draft") {
    throw new ApiError(409, "Only draft prototypes can be submitted");
  }

  const mentorUserId = await findMentorUserId(prototype.team);
  if (!mentorUserId) {
    throw new ApiError(400, "Your team needs an accepted mentor before submitting a prototype");
  }

  prototype.reviewStatus = "submitted";
  prototype.reviewer = mentorUserId;
  prototype.statusHistory.push({ status: "submitted", by: req.user._id });

  await prototype.save();

  return res
    .status(200)
    .json(new ApiResponse(200, prototype, "Prototype submitted for review"));
});


const resubmitPrototype = asyncHandler(async (req, res) => {
  const { prototype } = await loadForMember(req, { leaderOnly: true });

  if (prototype.reviewStatus !== "changes_requested") {
    throw new ApiError(409, "Only prototypes with requested changes can be resubmitted");
  }

  const note = req.body.note ? String(req.body.note).trim().slice(0, 1000) : undefined;

  prototype.statusHistory.push({
    status: "changes_requested",
    at: prototype.reviewedAt,
    by: prototype.reviewer,
    note: prototype.reviewFeedback,
  });

  const mentorUserId = await findMentorUserId(prototype.team);

  prototype.reviewStatus = "submitted";
  prototype.reviewer = mentorUserId || prototype.reviewer;
  prototype.reviewFeedback = undefined;
  prototype.reviewedAt = undefined;
  prototype.statusHistory.push({ status: "submitted", by: req.user._id, note });

  await prototype.save();

  return res
    .status(200)
    .json(new ApiResponse(200, prototype, "Revised prototype resubmitted for review"));
});


const getPrototypeStatus = asyncHandler(async (req, res) => {
  const { prototype } = await loadForRead(req);
  await prototype.populate("reviewer", "fullname username");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        _id: prototype._id,
        title: prototype.title,
        version: prototype.version,
        reviewStatus: prototype.reviewStatus,
        isEditable: EDITABLE.includes(prototype.reviewStatus),
        hasFeedback: Boolean(prototype.reviewFeedback),
        reviewer: prototype.reviewer || null,
        submittedAt: prototype.submittedAt || null,
        reviewedAt: prototype.reviewedAt || null,
      },
      "Prototype status fetched successfully"
    )
  );
});

const getPrototypeFeedback = asyncHandler(async (req, res) => {
  const { prototype } = await loadForRead(req);
  await prototype.populate("reviewer", "fullname username");

  const previousFeedback = prototype.statusHistory.filter(
    (h) => ["changes_requested", "rejected"].includes(h.status) && h.note
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        reviewStatus: prototype.reviewStatus,
        requiresChanges: prototype.reviewStatus === "changes_requested",
        currentFeedback: prototype.reviewFeedback || null,
        reviewer: prototype.reviewer || null,
        reviewedAt: prototype.reviewedAt || null,
        previousFeedback,
      },
      prototype.reviewFeedback
        ? "Feedback fetched successfully"
        : "No feedback has been given yet"
    )
  );
});

const getPrototypeVersionHistory = asyncHandler(async (req, res) => {
  const { prototype, access } = await loadForRead(req);

  const filter = { project: prototype.project };
  if (access === "mentor") filter.reviewStatus = { $ne: "draft" };

  const versions = await Prototype.find(filter)
    .select("title version reviewStatus submittedAt reviewedAt")
    .sort({ version: 1 })
    .lean();

  const timeline = [...prototype.statusHistory]
    .map((h) => h.toObject())
    .sort((a, b) => new Date(a.at) - new Date(b.at));

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        current: {
          _id: prototype._id,
          version: prototype.version,
          reviewStatus: prototype.reviewStatus,
        },
        timeline,
        versions,
      },
      "Version history fetched successfully"
    )
  );
});

export {
  createPrototype,
  updatePrototype,
  deletePrototype,
  getPrototype,
  getMyPrototypes,
  getProjectPrototypes,
  uploadPrototypeAttachment,
  deletePrototypeAttachment,
  submitPrototype,
  getPrototypeStatus,
  getPrototypeFeedback,
  resubmitPrototype,
  getPrototypeVersionHistory,
};