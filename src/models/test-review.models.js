import mongoose, { Schema } from "mongoose";

const DECISIONS = ["approved", "changes_requested", "rejected"];

const score = {
  type: Number,
  required: true,
  min: 1,
  max: 5,
  validate: { validator: Number.isInteger, message: "Scores must be whole numbers from 1 to 5" },
};

const textList = (maxItems) => ({
  type: [{ 
    type: String, 
    trim: true, 
    maxlength: 300 
  }],
  validate: {
    validator: (arr) => arr.length <= maxItems,
    message: `Maximum ${maxItems} items allowed`,
  },
});

const testReviewSchema = new Schema(
  {
    testReport: { 
      type: Schema.Types.ObjectId, 
      ref: "TestReport", 
      required: true 
    },
    project: { 
      type: Schema.Types.ObjectId, 
      ref: "Project", 
      required: true 
    },
    reviewer: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    round: { 
      type: Number, 
      required: true, 
      min: 1, 
      default: 1 
    },

    decision: { 
      type: String, 
      enum: DECISIONS, 
      required: true },

    testingMethodScore: score, // how sound the testing methodology is
    testCoverageScore: score, // how well the test cases cover the prototype
    resultAccuracyScore: score, // how accurate and honest the reported results are
    evidenceScore: score, // quality of the supporting evidence

    overallScore: { type: Number, min: 1, max: 5 },

    feedback: {
      type: String,
      trim: true,
      maxlength: 2000,
      minlength: 10,
      required: [
        function () {
          return this.decision !== "approved";
        },
        "Feedback is required when requesting changes or rejecting",
      ],
    },

    suggestions: textList(20), 
    requiredChanges: {
      ...textList(20),
      validate: [
        {
          validator: (arr) => arr.length <= 20,
          message: "Maximum 20 items allowed",
        },
        {
          validator: function (arr) {
            return this.decision !== "changes_requested" || arr.length > 0;
          },
          message: "List at least one required change when requesting changes",
        },
        {
          validator: function (arr) {
            return this.decision !== "approved" || arr.length === 0;
          },
          message: "An approved review cannot have required changes",
        },
      ],
    },

    reviewedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

testReviewSchema.pre("validate", function () {
  const parts = [
    this.testingMethodScore,
    this.testCoverageScore,
    this.resultAccuracyScore,
    this.evidenceScore,
  ];
  if (parts.every((n) => typeof n === "number")) {
    this.overallScore = Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 100) / 100;
  }
});

testReviewSchema.index({ testReport: 1, round: 1 }, { unique: true });
testReviewSchema.index({ project: 1 });
testReviewSchema.index({ reviewer: 1, reviewedAt: -1 });

export const TestReview = mongoose.model("TestReview", testReviewSchema);