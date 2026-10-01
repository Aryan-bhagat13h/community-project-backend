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
      required: [
        function () {
          return this.reporterType !== "citizen";
        },
        "Organization name is required for this reporter type",
      ],
    },

    contactPerson: { type: String, trim: true },
    designation: { type: String, trim: true },

    organizationEmail: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid organization email"],
    },

    organizationPhone: {
      type: String,
      trim: true,
      match: [/^\+?[0-9]{10,15}$/, "Invalid organization phone"],
    },

    website: {
      type: String,
      trim: true,
      match: [/^https?:\/\/\S+$/i, "Invalid website URL"],
    },

    address: { type: String, trim: true },
    location: { type: String, trim: true },

    description: { type: String, trim: true, maxlength: 1000 },

    areasOfProblems: [{ type: String, trim: true }],

    preferredCommunication: {
      type: String,
      enum: ["email", "phone", "platform"],
      default: "platform",
    },

    verificationDocuments: [
      {
        _id: false,
        url: String,
        publicId: String,
      },
    ],

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

export const ReporterProfile = mongoose.model("ReporterProfile", reporterProfileSchema);