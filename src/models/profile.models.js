import mongoose, { Schema } from "mongoose";

const profileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    profilePhoto: {
      type: String, // Cloudinary URL
    },

    phone: {
      type: String,
      required: true,
      trim: true,
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    student_profile: {
      type: Schema.Types.ObjectId,
      ref: "StudentProfile",
    },

    faculty_profile: {
      type: Schema.Types.ObjectId,
      ref: "FacultyProfile",
    },

    reporter_profile: {
      type: Schema.Types.ObjectId,
      ref: "ReporterProfile",
    },

    admin_profile: {
      type: Schema.Types.ObjectId,
      ref: "AdminProfile",
    },
  },
  { timestamps: true }
);

export const Profile = mongoose.model("Profile", profileSchema);