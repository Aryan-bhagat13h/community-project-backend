import mongoose, { Schema } from "mongoose";

const savedProblemSchema = new Schema({
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    problem: { type: Schema.Types.ObjectId, ref: "Problem", required: true }
},{timestamps: true});

savedProblemSchema.index({ user: 1, problem: 1 }, { unique: true });

export const SavedProblem = mongoose.model("SavedProblem", savedProblemSchema);