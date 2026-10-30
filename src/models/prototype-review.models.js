import mongoose, { Schema } from "mongoose";

const score = {
  type: Number,
  min: 1,
  max: 5,
  validate: { 
    validator: Number.isInteger, 
    message: "Scores must be whole numbers from 1 to 5" 
  },
};

const shortText = [{ 
  type: String, 
  trim: true, maxlength: 300 
}];

const commentSchema = new Schema({
  author: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  text: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 1000 
  },
  section: { 
    type: String, 
    trim: true, 
    maxlength: 50 
  },
  visibleToTeam: { 
    type: Boolean, 
    default: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
});


const prototypeReviewSchema = new Schema(
  {
    prototype: { 
      type: Schema.Types.ObjectId, 
      ref: "Prototype", 
      required: true 
    },
    project: { 
      type: Schema.Types.ObjectId, 
      ref: "Project", 
      required: true 
    },
    team: { 
      type: Schema.Types.ObjectId, 
      ref: "Team", 
      required: true 
    },
    version: { 
      type: Number, 
      required: true 
    }, // prototype version at review time
    round: { 
      type: Number, 
      required: true, 
      min: 1 
    },
    reviewer: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    status: { 
      type: String, 
      enum: ["in_progress", "completed"], 
      default: "in_progress" 
    },
    decision: {
      type: String,
      enum: ["approved", "changes_requested", "rejected"],
      required: [
        function () {
          return this.status === "completed";
        },
        "A completed review needs a decision",
      ],
    },

    scores: {
      innovation: score,
      technicalQuality: score,
      completeness: score,
      documentation: score,
      testing: score,
    },
    overallScore: { 
      type: Number, 
      min: 1, 
      max: 5 
    }, // average of the scores given

    strengths: shortText,
    weaknesses: shortText,
    summary: { 
      type: String, 
      trim: true, 
      maxlength: 2000 
    },

    feedback: { 
      type: String, 
      trim: true, 
      maxlength: 2000 
    }, // decision message
    requestedChanges: shortText,

    comments: {
      type: [commentSchema],
      validate: {
        validator: (arr) => arr.length <= 50,
        message: "A review can have at most 50 comments",
      },
    },

    decidedAt: { type: Date },
  },
  { timestamps: true }
);

prototypeReviewSchema.index({ prototype: 1, round: 1 }, { unique: true });
prototypeReviewSchema.index({ project: 1, version: 1, round: 1 });
prototypeReviewSchema.index({ reviewer: 1, status: 1 });

export const PrototypeReview = mongoose.model("PrototypeReview", prototypeReviewSchema);