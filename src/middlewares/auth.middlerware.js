import jwt from "jsonwebtoken"
import {User} from '../models/user.mdoels.js'
import { asyncHandler } from "../utils/async-handler.js"
import {ApiError} from '../utils/api-error.js'


const verifyJwt = asyncHandler(async (req, _, next) => {
  try {
    const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      throw new ApiError(401, "Unauthorised access")
    }

    const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET)
    const user = await User.findById(decodedToken?._id).select("-password -refreshToken")

    if (!user) {
      throw new ApiError(401, "User is unauthorised")
    }

    req.user = user
    next()
  } catch (err) {
    throw new ApiError(err?.statusCode || 401, err?.message || "Invalid access token")
  }
})

export { verifyJwt }