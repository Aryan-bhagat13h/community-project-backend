import multer from "multer";
import fs from "fs";
import path from "path";
import { ApiError } from "../utils/api-error.js";

fs.mkdirSync("./temp", { recursive: true }); 

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, "./temp"),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (_req, file, cb) => {
  if (!ALLOWED_TYPES.includes(file.mimetype)) {
    return cb(new ApiError(400, "Unsupported file type"));
  }
  cb(null, true);
};

export const uploadAttachments = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024, files: 5 },
});