
import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";

const healthcheck = asyncHandler(async (req, res) => {
    return res.json(new ApiResponse(200, { }, "healthy"));
})

export {
    healthcheck
    }
    