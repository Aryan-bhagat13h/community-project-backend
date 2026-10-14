import mongoose, { Schema } from "mongoose";

const progressUpdateSchema = new Schema(
  {
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
    postedBy: { 
      type: Schema.Types.ObjectId, 
      ref: "User", 
      required: true 
    },

    title: { 
      type: String, 
      required: true, 
      trim: true,
      minlength: 3, 
      maxlength: 100 },
    description: { 
      type: String, 
      required: true, 
      trim: true, 
      maxlength: 2000 
    },
    percentComplete: { 
      type: Number, 
      min: 0, 
      max: 100 
    },
    completedMilestones: [{ 
      type: String, 
      trim: true 
    }],
    challenges: { 
      type: String, 
      trim: true, 
      maxlength: 1000 },
    nextSteps: { 
      type: String, 
      trim: true, maxlength: 1000 
    },

    attachments: [
      {
        _id: false,
        name: { type: String, trim: true },
        url: { type: String, required: true, trim: true },
        publicId: { type: String, trim: true },
      },
    ],
  },
  { timestamps: true }
);

progressUpdateSchema.index({ project: 1, createdAt: -1 });

export const ProgressUpdate = mongoose.model("ProgressUpdate", progressUpdateSchema);