import mongoose, { Schema } from "mongoose";

const studentProfileSchema = new Schema(
  {
    studentId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },

    college: { type: String, trim: true },
    department: { type: String, trim: true },
    degree: { type: String, trim: true },

    currentYear: { type: Number, min: 1, max: 4 },
    currentSemester: { type: Number, min: 1, max: 8 },
    graduationYear: { type: Number, min: 2000, max: 2100 },

    skills: [
      {
        _id: false,
        name: { type: String, trim: true },
        level: {
          type: String,
          enum: ["beginner", "intermediate", "advanced"],
        },
      },
    ],

    interests: [String],
    researchInterests: [String],
    preferredDomains: [String],

    github: { type: String, trim: true },
    linkedin: { type: String, trim: true },
    portfolio: { type: String, trim: true },
  },
  { timestamps: true }
);

export const StudentProfile = mongoose.model("StudentProfile", studentProfileSchema);