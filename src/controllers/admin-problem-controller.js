import { Problem } from '../models/problem.models.js';
import {asyncHandler} from '../utils/async-handler.js';
import {ApiResponse} from '../utils/api-response.js';
import {ApiError} from '../utils/api-error.js';

const updateVerificationStatus = asyncHandler(async(req,res) => {
  if(!req.user?._id){
    throw new ApiError(401, "Unauthorised access")
  }
  const {problemId} = req.params
  const problem = await Problem.findById(problemId);

  if(!problem){
    throw new ApiError(404, "Problem not found");
  }

  const {verificationStatus} = req.body;

  const validStatuses = ["pending", "under_review", "verified", "rejected", "needs_revision"];

  if (!validStatuses.includes(verificationStatus.trim())) {
    return res.status(400).json({ error: "Invalid verification status." });
  }

  problem.verificationStatus = verificationStatus.trim();
  await problem.save();

  return res
    .satus(200)
    .json(new ApiResponse(200, problem, "Verification status updated successfully"))
});

const rejectProblem = asyncHandler(async (req, res) => {
  const { problemId } = req.params

  if (!mongoose.Types.ObjectId.isValid(problemId)) {
    throw new ApiError(400, "Invalid issue id")
  }

  const { rejectionReason } = req.body

  if (!rejectionReason || rejectionReason.trim() === "") {
    throw new ApiError(400, "Rejection reason is required")
  }

  const problem = await Problem.findOneAndUpdate(
    { _id: problemId, isDeleted: false },
    {
      $set: {
        status: "rejected",
        rejectedAt: new Date(),
        rejectedBy: req.user._id,
        rejectionReason: rejectionReason.trim(),
        isRejected: true
      }
    },
    { new: true }
  )

  if (!issue) {
    throw new ApiError(404, "Issue not found")
  }

  return res
    .status(200)
    .json(new ApiResponse(200, issue, "Issue rejected successfully"))
})

export {updateVerificationStatus}