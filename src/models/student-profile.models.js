import mongoose, { Schema } from "mongoose";

const studentProfileSchema = new Schema(
  {
    studentId: {
      type: String,
      trim: true,
    },

    college: {
      type: String,
      trim: true,
    },

    department: {
      type: String,
      trim: true,
    },

    degree: {
      type: String,
      trim: true,
    },

    currentYear: {
      type: Number,
    },

    currentSemester: {
      type: Number,
    },

    graduationYear: {
      type: Number,
    },

    skills: [
      {
        name: String,
        level: {
          type: String,
          enum: ["beginner", "intermediate", "advanced"],
        },
      },
    ],

    interests: [String],

    researchInterests: [String],

    preferredDomains: [String],

    github: {
      type: String,
      trim: true,
    },

    linkedin: {
      type: String,
      trim: true,
    },

    portfolio: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export const StudentProfile = mongoose.model(
  "StudentProfile",
  studentProfileSchema
);