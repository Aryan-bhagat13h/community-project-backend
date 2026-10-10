import mongoose, { Schema } from "mongoose";

const projectSchema = new Schema(
  {
    projectName: {
      type: String,
      trim: true,
      required: true,
      minlength: 3,
      maxlength: 100,
    },
    projectDescription: {
      type: String,
      trim: true,
      maxlength: 2000,
    },
    objective: {
      type: String,
      trim: true,
      required: true,
    },
    expectedSolution: {
      type: String,
      trim: true,
      required: true,
    },
    technologies: {
      type: [{ type: String, trim: true }],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one technology is required",
      },
    },
    estimatedDuration: {
      type: Number, // in weeks
      min: 1,
    },
    problem: {
      type: Schema.Types.ObjectId,
      ref: "Problem",
      required: true,
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

projectSchema.index({ team: 1 });
projectSchema.index({ problem: 1 });

export const Project = mongoose.model("Project", projectSchema);