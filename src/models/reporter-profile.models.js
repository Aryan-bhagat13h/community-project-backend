import mongoose, { Schema } from "mongoose";

const reporterProfileSchema = new Schema(
  {
    reporterType: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      enum: [
        "citizen",
        "farmer",
        "ngo",
        "industry",
        "hospital",
        "school",
        "university",
        "government",
        "municipality",
        "organization",
        "other",
      ],
    },

    organizationName: {
      type: String,
      trim: true,
    },

    organizationType: {
      type: String,
      trim: true,
    },

    contactPerson: {
      type: String,
      trim: true,
    },

    designation: {
      type: String,
      trim: true,
    },

    organizationEmail: {
      type: String,
      lowercase: true,
      trim: true,
    },

    organizationPhone: {
      type: String,
      trim: true,
    },

    website: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
    },

    location: {
      type: String,
      trim: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },

    areasOfProblems: [
      {
        type: String,
        trim: true,
      },
    ],

    preferredCommunication: {
      type: String,
      enum: ["email", "phone", "platform"],
      default: "platform",
    },

    verificationDocuments: [
      {
        type: String, // Cloudinary URLs
      },
    ],

    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const ReporterProfile = mongoose.model(
  "ReporterProfile",
  reporterProfileSchema
);