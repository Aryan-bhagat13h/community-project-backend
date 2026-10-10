import mongoose, { Schema } from "mongoose";

const stringList = () => [{ type: String, trim: true }];

const problemSchema = new Schema(
  {
    // Problem details 
    title: {
      type: String,
      trim: true,
      minlength: 5,
      maxlength: 50,
      required: true,
    },
    description: {
      type: stringList(),
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one description entry is required",
      },
    },
    category: {
      type: String,
      enum: [
        "agriculture",
        "healthcare",
        "education",
        "environment",
        "water",
        "sanitation",
        "waste_management",
        "transportation",
        "infrastructure",
        "energy",
        "public_safety",
        "governance",
        "technology",
        "employment",
        "finance",
        "social_welfare",
        "housing",
        "tourism",
        "disaster_management",
        "other",
      ],
      required: true,
    },
    subCategory: stringList(),
    problemType: {
      type: String,
      enum: [
        "social",
        "technical",
        "environmental",
        "infrastructure",
        "economic",
        "health",
        "educational",
        "governance",
        "safety",
        "other",
      ],
      required: true,
      trim: true,
    },
    currentSituation: stringList(),
    expectedOutcome: stringList(),
    preferredCommunication: {
      type: String,
      enum: ["email", "phone", "platform"],
      required: true,
      default: "email",
    },

    // Location 
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
        validate: {
          validator: (v) =>
            Array.isArray(v) &&
            v.length === 2 &&
            v[0] >= -180 && v[0] <= 180 &&
            v[1] >= -90 && v[1] <= 90,
          message: "Coordinates must be [longitude, latitude]",
        },
      },
    },
    locationType: {
      type: String,
      required: true,
      enum: [
        "household",
        "locality",
        "village",
        "town",
        "city",
        "district",
        "state",
        "regional",
        "national",
        "other",
      ],
    },

    // Who is affected
    isPopulationAffected: {
      type: Boolean,
      required: true,
      default: false,
    },
    approxNoPeopleAffected: {
      type: Number,
      min: 0,
      default: 0,
    },
    hasAffectedGroups: {
      type: Boolean,
      required: true,
      default: false,
    },
    affectedGroups: {
      type: [String],
      enum: [
        "students",
        "farmers",
        "children",
        "elderly",
        "patients",
        "women",
        "workers",
        "local_residents",
        "businesses",
        "government_employees",
        "animals",
        "environment",
        "persons_with_disabilities",
        "other",
      ],
      default: [],
    },

    // Admin / AI assessed 
    severity: {
      type: String,
      enum: ["low", "moderate", "high", "critical"],
      default: "low",
    },
    urgency: {
      type: String,
      enum: ["low", "moderate", "urgent", "emergency"],
      default: "low",
    },
    skills: stringList(), // AI assessed
    verificationStatus: {
      type: String,
      required: true,
      enum: [
        "pending",
        "under_review",
        "verified",
        "rejected",
        "needs_revision",
      ],
      default: "pending",
    },

    // Impact
    impact: {
      areas: {
        type: [String],
        enum: ["social", "economic", "environmental", "health", "safety"],
        default: [],
      },
      description: {
        type: String,
        trim: true,
        maxlength: 1000,
      },
    },

    // Evidence
    problemPhoto: {
      type: String, // cloudinary url
      required: true,
      trim: true,
    },
    problemVideo: {
      type: String, // cloudinary url
      trim: true,
    },

    // Meta
    reportedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    deletedBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    deleteReason: {
      type: String,
      trim: true
    },
    isRejected: {
      type: Boolean,
      default: false
    },
    rejectedAt: {
      type: Date
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    rejectionReason: {
      type: String,
      trim: true
    },
    isAdopted: {
      type: Boolean, 
      default: false
    },
    adoptedBy: {
      type: Schema.Types.ObjectId,
      ref: "User"
    },
    adoptedAt: { 
      type: Date 
    }
  },
  { timestamps: true }
);

// Geo queries 
problemSchema.index({ location: "2dsphere" });
problemSchema.index({ verificationStatus: 1, isDeleted: 1, createdAt: -1 });
problemSchema.index({ skills: 1 });

export const Problem = mongoose.model("Problem", problemSchema);