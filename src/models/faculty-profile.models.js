import mongoose, { Schema } from "mongoose";

const facultyProfileSchema = new Schema(
  {
    facultyId: {
      type: String,
      trim: true,
    },

    institution: {
      type: String,
      required: true,
      trim: true,
    },

    department: {
      type: String,
      trim: true,
    },

    designation: {
      type: String,
      trim: true,
    },

    qualifications: [
      {
        type: String,
        trim: true,
      },
    ],

    expertise: [
      {
        type: String,
        trim: true,
      },
    ],

    researchInterests: [
      {
        type: String,
        trim: true,
      },
    ],

    subjects: [
      {
        type: String,
        trim: true,
      },
    ],

    experience: {
      type: Number,
      min: 0,
    },

    mentorshipAreas: [
      {
        type: String,
        trim: true,
      },
    ],

    availability: {
      type: String,
      trim: true,
    },

    maxTeams: {
      type: Number,
      min: 0,
      default: 5,
    },

    linkedin: {
      type: String,
      trim: true,
    },

    profileUrl: {
      type: String,
      trim: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const FacultyProfile = mongoose.model(
  "FacultyProfile",
  facultyProfileSchema
);