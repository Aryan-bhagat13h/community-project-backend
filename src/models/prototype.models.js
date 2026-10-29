import mongoose, { Schema } from "mongoose";

const urlRegex = /^https?:\/\/\S+$/i;
const isDraft = (doc) => doc.reviewStatus === "draft";

const requiredOnSubmit = (label) => [
  function () {
    return !isDraft(this);
  },
  `${label} is required before submitting`,
];

const urlField = { type: String, trim: true, match: [urlRegex, "Invalid URL"] };
const stringList = [{ type: String, trim: true, maxlength: 200 }];
const maxTen = { validator: (arr) => arr.length <= 10, message: "Maximum 10 items allowed" };

const prototypeSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: requiredOnSubmit("Description"),
    },

    version: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isInteger, message: "Version must be a whole number" },
    },

    type: {
      type: String,
      required: true,
      enum: ["software", "hardware", "research_model", "physical_product", "process", "other"],
    },

    technologies: stringList, // optional

    completedFeatures: {
      type: stringList,
      validate: {
        validator: function (arr) {
          return isDraft(this) || (Array.isArray(arr) && arr.length > 0);
        },
        message: "At least one completed feature is required before submitting",
      },
    },
    partiallyCompletedFeatures: stringList, // optional
    plannedFeatures: stringList, // optional

    demoUrl: urlField,
    repositoryUrl: urlField,
    readmeUrl: urlField,
    architectureUrl: urlField,
    demoVideo: urlField,

    screenshots: {
      type: [
        {
          _id: false,
          url: { type: String, required: true },
          publicId: String,
        },
      ],
      validate: maxTen,
    },

    attachments: {
      type: [
        {
          _id: false,
          name: { type: String, trim: true, maxlength: 100 },
          url: { type: String, required: true },
          publicId: String,
          kind: { type: String, enum: ["file", "diagram", "document"], default: "file" },
        },
      ],
      validate: maxTen,
    },

    testingSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: requiredOnSubmit("Testing summary"),
    },
    testingResults: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: requiredOnSubmit("Testing results"),
    },
    reviewStatus: {
      type: String,
      enum: ["draft", "submitted", "under_review", "changes_requested", "approved", "rejected"],
      default: "draft",
    },
    reviewer: { type: Schema.Types.ObjectId, ref: "User" },
    reviewFeedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: [
        function () {
          return ["changes_requested", "rejected"].includes(this.reviewStatus);
        },
        "Feedback is required when requesting changes or rejecting",
      ],
    },
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

prototypeSchema.pre("validate", async function () {
  if (isDraft(this)) return;

  if (this.type === "software" && !this.repositoryUrl) {
    this.invalidate("repositoryUrl", "Repository URL is required for software prototypes");
  }

  const hasEvidence =
    this.demoUrl ||
    this.demoVideo ||
    this.repositoryUrl ||
    this.screenshots?.length ||
    this.attachments?.length;

  if (!hasEvidence) {
    this.invalidate("demoUrl", "Provide at least one demo, repository, screenshot or attachment");
  }
});

prototypeSchema.pre("save", async function () {
  if (!this.isModified("reviewStatus")) return;

  if (this.reviewStatus === "submitted") {
    this.submittedAt = new Date();
  }
  if (["approved", "rejected", "changes_requested"].includes(this.reviewStatus)) {
    this.reviewedAt = new Date();
  }
});

prototypeSchema.index({ project: 1, version: 1 }, { unique: true });
prototypeSchema.index({ team: 1 });
prototypeSchema.index({ reviewer: 1, reviewStatus: 1 });

export const Prototype = mongoose.model("Prototype", prototypeSchema);