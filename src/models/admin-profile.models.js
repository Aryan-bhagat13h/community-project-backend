import mongoose, { Schema } from "mongoose";

const adminProfileSchema = new Schema(
  {
    adminType: {
      type: String,
      required: true,
      enum: ["super_admin", "moderator", "project_admin"],
      default: "moderator",
    },

    department: {
      type: String,
      trim: true,
    },

    responsibilities: [
      {
        type: String,
        trim: true,
      },
    ],

    permissionLevel: {
      type: Number,
      min: 1,
      max: 3,
      default: 1,
    },

    mfaEnabled: {
      type: Boolean,
      default: false,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

export const AdminProfile = mongoose.model(
  "AdminProfile",
  adminProfileSchema
);