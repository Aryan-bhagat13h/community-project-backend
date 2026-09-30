import mongoose, { Schema } from "mongoose";
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const userSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
    },

    role: {
      type: String,
      required: true,
      lowercase: true,
      enum: ["student", "faculty", "admin", "reporter"],
      default: "reporter",
    },
    refreshToken: {
    type: String,
  },
  },
  { timestamps: true }
);

userSchema.pre("save",  async function() {
  if(!this.isModified("password"))return;
   this.password = await bcrypt.hash(this.password, 10)
})

userSchema.methods.isPasswordCorrect = async function(password){
  return await bcrypt.compare(password, this.password)
}

userSchema.methods.generateAccessToken = function (){
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      username: this.username,
      fullname: this.fullname
   },
   process.env.ACCESS_TOKEN_SECRET,
   {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY
   }
)
}

userSchema.methods.generateRefreshToken = function (){
  return jwt.sign(
    {
      _id: this._id,
   },
   process.env.REFRESH_TOKEN_SECRET,
   {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRY
   }
)
}

export const User = mongoose.model("User", userSchema);