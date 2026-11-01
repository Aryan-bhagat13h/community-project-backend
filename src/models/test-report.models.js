import mongoose, { Schema } from "mongoose";

const isDraft = (doc) => doc.reviewStatus === "draft";

// Marks a field as required only once the report leaves "draft"
const requiredOnSubmit = (name) => [
  function () {
    return !isDraft(this);
  },
  `${name} is required before submitting`,
];

const maxItems = (n) => ({
  validator: (arr) => arr.length <= n,
  message: `Maximum ${n} items allowed`,
});

const testCaseSchema = new Schema({
  name: { type: String, trim: true, required: true, maxlength: 150 },
  expectedResult: { type: String, trim: true, required: true, maxlength: 500 },
  actualResult: { type: String, trim: true, required: true, maxlength: 500 },
  status: { type: String, enum: ["passed", "failed", "blocked"], required: true },
});

const bugSchema = new Schema({
  description: { type: String, trim: true, required: true, minlength: 3, maxlength: 1000 },
  severity: { type: String, enum: ["low", "medium", "high", "critical"], required: true },
  status: { type: String, enum: ["open", "fixed", "wont_fix"], default: "open" },
});

// Files (screenshots, logs, recordings) uploaded to Cloudinary
const evidenceSchema = new Schema({
  url: { type: String, required: true },
  publicId: { type: String },
  resourceType: { type: String, default: "image" },
  name: { type: String, trim: true, maxlength: 100 },
});

const testReportSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    prototype: { type: Schema.Types.ObjectId, ref: "Prototype", required: true },
    team: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },

    title: { type: String, trim: true, required: true, minlength: 3, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 2000 },

    // How the prototype was tested
    testingMethod: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 1000,
      required: requiredOnSubmit("Testing method"),
    },

    testCases: {
      type: [testCaseSchema],
      validate: [
        maxItems(200),
        {
          validator: function (arr) {
            return isDraft(this) || arr.length > 0;
          },
          message: "At least one test case is required before submitting",
        },
      ],
    },

    bugsFound: { type: [bugSchema], validate: maxItems(100) }, // optional

    userFeedback: {
      type: [{ type: String, trim: true, maxlength: 500 }],
      validate: maxItems(50),
    }, // optional

    testEvidence: {
      type: [evidenceSchema],
      validate: [
        maxItems(10),
        {
          validator: function (arr) {
            return isDraft(this) || arr.length > 0;
          },
          message: "At least one piece of test evidence is required before submitting",
        },
      ],
    },

    // Calculated from testCases automatically; clients can never set these
    totalTests: { type: Number, default: 0, min: 0 },
    passedTests: { type: Number, default: 0, min: 0 },
    failedTests: { type: Number, default: 0, min: 0 },
    blockedTests: { type: Number, default: 0, min: 0 },

    testingSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      required: requiredOnSubmit("Testing summary"),
    },

    limitations: {
      type: [{ type: String, trim: true, maxlength: 300 }],
      validate: maxItems(30),
    }, // optional

    // Controlled by the review workflow. Never copy these from req.body.
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

    statusHistory: [
      {
        _id: false,
        status: {
          type: String,
          enum: ["draft", "submitted", "under_review", "changes_requested", "approved", "rejected"],
        },
        at: { type: Date, default: Date.now },
        by: { type: Schema.Types.ObjectId, ref: "User" },
        note: { type: String, trim: true, maxlength: 2000 },
      },
    ],
    // createdAt / updatedAt come from `timestamps: true`
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } }
);

// Keep the counters in sync with the test cases
testReportSchema.pre("validate", function () {
  const cases = this.testCases || [];
  this.totalTests = cases.length;
  this.passedTests = cases.filter((c) => c.status === "passed").length;
  this.failedTests = cases.filter((c) => c.status === "failed").length;
  this.blockedTests = cases.filter((c) => c.status === "blocked").length;
});

// Stamp the dates automatically when the status changes
testReportSchema.pre("save", function () {
  if (!this.isModified("reviewStatus")) return;

  if (this.reviewStatus === "submitted") {
    this.submittedAt = new Date();
  }
  if (["approved", "rejected", "changes_requested"].includes(this.reviewStatus)) {
    this.reviewedAt = new Date();
  }
});

// Percentage of test cases that passed (null when there are no test cases)
testReportSchema.virtual("passRate").get(function () {
  if (!this.totalTests) return null;
  return Math.round((this.passedTests / this.totalTests) * 1000) / 10;
});

testReportSchema.index({ prototype: 1, createdAt: -1 });
testReportSchema.index({ team: 1 });
testReportSchema.index({ reviewer: 1, reviewStatus: 1 });

export const TestReport = mongoose.model("TestReport", testReportSchema);