import mongoose, { Schema } from "mongoose";

const adminProfileSchema = new Schema(
  {
    adminType: {
      type: String,
      required: true,
      enum: ["moderator", "project_admin", "super_admin"],
      default: "moderator",
    },

    department: { type: String, trim: true },

    responsibilities: [{ type: String, trim: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const AdminProfile = mongoose.model("AdminProfile", adminProfileSchema);