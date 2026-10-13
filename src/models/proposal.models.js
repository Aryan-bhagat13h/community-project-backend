import mongoose, { Schema } from "mongoose";

const stringList = () => [{ type: String, trim: true }];


export const PROPOSAL_SECTIONS = [
  "general", "title", "description", "problemSummary", "rootCauses",
  "peopleAffected", "solution", "resources", "budget", "timeline",
  "beneficiaries", "riskAssessment", "attachments",
];

const suggestionSchema = new Schema(
  {
    suggestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    section: { type: String, enum: PROPOSAL_SECTIONS, default: "general" },
    message: { type: String, required: true, trim: true, maxlength: 1000 },
    isResolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

const expenseSchema = new Schema(
  {
    item: { 
      type: String, 
      required: true, 
      trim: true },
    amount: { 
      type: Number, 
      required: true, 
      min: 0 },
  },
  { _id: false }
);

const milestoneSchema = new Schema(
  {
    title: { 
      type: String, 
      required: true, 
      trim: true 
    },
    description: { 
      type: String, 
      trim: true, 
      maxlength: 500 
    },
    dueDate: { 
      type: Date 
    },
  },
  { _id: false }
);

const riskSchema = new Schema(
  {
    description: { 
      type: String, 
      required: true, 
      trim: true 
    },
    mitigation: { 
      type: String, 
      trim: true 
    },
  },
  { _id: false }
);

const attachmentSchema = new Schema(
  {
    category: {
      type: String,
      required: true,
      enum: ["document", "diagram", "design", "research"],
    },
    name: { 
      type: String, 
      trim: true 
    },
    url: { 
      type: String, 
      required: true, 
      trim: true 
    },
    publicId: { 
      type: String, 
      trim: true 
    },
  },
  { _id: false }
);

const proposalSchema = new Schema(
  {
    title: { 
      type: String, 
      required: true, 
      trim: true, 
      minlength: 3, 
      maxlength: 50 
    },
    description: { 
      type: String, 
      trim: true, 
      maxlength: 200 
    },
    project: { 
      type: Schema.Types.ObjectId, 
      ref: "Project", 
      required: true },
    team: { 
      type: Schema.Types.ObjectId, 
      ref: "Team", 
      required: true 
    },
    problemSummary: { 
      type: String, 
      trim: true, 
      maxlength: 200 },
    rootCauses: { 
      type: String, 
      trim: true 
    },
    peopleAffected: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    solutionDescription: { 
      type: String, 
      required: true, 
      trim: true, minlength: 10 
    },
    howItWorks: { 
      type: String, 
      required: true, 
      trim: true },
    keyFeatures: stringList(),

    resources: {
      software: stringList(),
      hardware: stringList(),
      equipment: stringList(),
      materials: stringList(),
      data: stringList(),
      infrastructure: stringList(),
    },

    budget: {
      estimatedCost: { 
        type: Number, 
        min: 0 
      },
      currency: { 
        type: String, 
        trim: true, 
        uppercase: true, 
        default: "INR" 
      },
      itemizedExpenses: [expenseSchema],
      fundingRequirements: { 
        type: String, 
        trim: true, 
        maxlength: 1000 
      },
    },

    timeline: {
      startDate: { type: Date },
      endDate: { type: Date },
      milestones: [milestoneSchema],
      deliverables: stringList(),
    },

    beneficiaries: {
      targetPopulation: { 
        type: String, 
        trim: true, 
        maxlength: 500 
      },
      organizations: stringList(),
      communities: stringList(),
    },

    riskAssessment: {
      risks: [riskSchema],
      constraints: stringList(),
      dependencies: stringList(),
    },

    attachments: [attachmentSchema],

    suggestions: [suggestionSchema],

    status: {
      type: String,
      enum: ["draft", "submitted", "under_review", "approved", "rejected"],
      default: "draft",
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    isRejected: {
      type: Boolean,
      default: false
    },
    rejectedAt: {
      type: Date,
      required: true
    },
    rejectionReason: {
      type: String,
      required: true,
      trim: true,
      minlength: 5
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    }
  },
  { timestamps: true }
);

proposalSchema.index({ project: 1 }, { unique: true }); // one proposal per project
proposalSchema.index({ team: 1 });

export const Proposal = mongoose.model("Proposal", proposalSchema);