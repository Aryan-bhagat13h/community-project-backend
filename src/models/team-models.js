import mongoose, { Schema } from "mongoose";

const teamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 50,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    maxMembers: {
      type: Number,
      required: true,
      min: 2,
      max: 8,
    },
    leader: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    teamMembers: {
      type: [{ type: Schema.Types.ObjectId, ref: "User" }],
      default: [],
      validate: [
        {
          validator: function (arr) {
            return arr.length <= this.maxMembers;
          },
          message: "Team cannot exceed maxMembers",
        },
        {
          validator: (arr) => new Set(arr.map(String)).size === arr.length,
          message: "Duplicate members are not allowed",
        },
      ],
    },
  },
  { timestamps: true }
);

teamSchema.index({ teamMembers: 1 }); // fast lookups

export const Team = mongoose.model("Team", teamSchema);