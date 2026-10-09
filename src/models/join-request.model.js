import mongoose, { Schema } from "mongoose";

const joinRequestSchema = new Schema(
  {
    team: {
      type: Schema.Types.ObjectId,
      ref: "Team",
      required: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "rejected"],
      default: "pending",
    },
    respondedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);


joinRequestSchema.index(
  { team: 1, user: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

joinRequestSchema.index({ team: 1, status: 1, createdAt: -1 });

export const JoinRequest = mongoose.model("JoinRequest", joinRequestSchema);