import mongoose, { Schema } from "mongoose";

const urlRegex = /^https?:\/\/\S+$/i;
const stringList = [{ type: String, trim: true }];

const facultyProfileSchema = new Schema(
  {
    facultyId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    institution: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },

    qualifications: stringList,
    expertise: stringList,
    researchInterests: stringList,
    subjects: stringList,
    mentorshipAreas: stringList,

    experience: { type: Number, min: 0, max: 60 }, 

    availability: { type: String, trim: true, maxlength: 200 },

    maxTeams: { type: Number, min: 0, max: 50, default: 5 },

    linkedin: { type: String, trim: true, match: [urlRegex, "Invalid LinkedIn URL"] },
    profileUrl: { type: String, trim: true, match: [urlRegex, "Invalid profile URL"] },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "rejected"],
      default: "pending",
    },
    verifiedBy: { type: Schema.Types.ObjectId, ref: "User" },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

export const FacultyProfile = mongoose.model("FacultyProfile", facultyProfileSchema);