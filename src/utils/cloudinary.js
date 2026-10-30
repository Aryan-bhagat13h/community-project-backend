import { v2 as cloudinary } from "cloudinary";
import fs from "fs";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Removes the temp file and never throws (it may already be gone)
const removeLocalFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore: failing to clean a temp file must not break the request
  }
};

const uploadOnCloudinary = async (localFilePath) => {
  if (!localFilePath) return null;

  try {
    const response = await cloudinary.uploader.upload(localFilePath, {
      resource_type: "auto",
    });
    return response;
  } catch (error) {
    return null;
  } finally {
    removeLocalFile(localFilePath);
  }
};


const deleteFromCloudinary = async (publicId, resourceType = "image") => {
  if (!publicId) return false;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true,
    });
    return result?.result === "ok" || result?.result === "not found";
  } catch (error) {
    return false;
  }
};

export { uploadOnCloudinary, deleteFromCloudinary };