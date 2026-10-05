import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/async-handler.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { User, hashToken } from '../models/user.models.js'

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
};

const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, "User not found");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = hashToken(refreshToken); 
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    if (error instanceof ApiError) throw error;  
    throw new ApiError(500, "Something went wrong while generating tokens");
  }
};

const registerUser = asyncHandler(async (req, res) => {
  const { fullname, email, password, username } = req.body;

  if ([fullname, email, password, username].some((f) => !f || String(f).trim() === "")) {
    throw new ApiError(400, "All fields (fullname, email, password, username) are required");
  }

  const existedUser = await User.findOne({
    $or: [{ email: email.toLowerCase() }, { username: username.toLowerCase() }],
  });

  if (existedUser) {
    throw new ApiError(409, "User with same email or username already exists");
  }

  const user = await User.create({
    fullname,
    email: email.toLowerCase(),
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id);
  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering user");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, createdUser, "User registered successfully"));
});

const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!email && !username) {
    throw new ApiError(400, "Email or username is required");
  }
  if (!password) {
    throw new ApiError(400, "Password is required");
  }

  const queryConditions = [];
  if (email) queryConditions.push({ email: email.toLowerCase() });
  if (username) queryConditions.push({ username: username.toLowerCase() });

  const user = await User.findOne({ $or: queryConditions }).select("+password");

  if (!user || !(await user.isPasswordCorrect(password))) {
    throw new ApiError(401, "Invalid credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

  const loggedInUser = await User.findById(user._id);
  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(new ApiResponse(200, { user: loggedInUser }, "User logged in successfully"));
});

const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { $unset: { refreshToken: 1 } });

  return res
    .status(200)
    .clearCookie("accessToken", cookieOptions)
    .clearCookie("refreshToken", cookieOptions)
    .json(new ApiResponse(200, null, "User logged out successfully"));
});

const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingToken = req.cookies?.refreshToken || req.body?.refreshToken;
  if (!incomingToken) {
    throw new ApiError(401, "Unauthorized request");
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, process.env.REFRESH_TOKEN_SECRET);
  } catch {
    throw new ApiError(401, "Invalid or expired refresh token");
  }

  const user = await User.findById(decoded._id).select("+refreshToken");
  if (!user || user.refreshToken !== hashToken(incomingToken)) {
    throw new ApiError(401, "Refresh token is invalid or already used");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(user._id);

  return res
    .status(200)
    .cookie("accessToken", accessToken, cookieOptions)
    .cookie("refreshToken", refreshToken, cookieOptions)
    .json(new ApiResponse(200, null, "Access token refreshed"));
});

export { registerUser, loginUser, logoutUser, refreshAccessToken };