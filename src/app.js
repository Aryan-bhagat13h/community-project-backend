import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import userRouter from "./routes/user.routes.js";
import profileRouter from "./routes/profile.routes.js";
import studentRouter from "./routes/student.routes.js";
import facultyRouter from "./routes/faculty.routes.js";
import adminRouter from "./routes/admin.routes.js";
import reporterRouter from "./routes/reporter.routes.js";
import problemRouter from "./routes/problem.routes.js";
import teamRouter from "./routes/team.routes.js";

const app = express();

app.use(cors({
  origin: process.env.ORIGIN_CORS,
  credentials: true,
}));

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Routes
app.use("/api/v1/users", userRouter);
app.use("/api/v1/profile", profileRouter);
app.use("/api/v1/students", studentRouter);
app.use("/api/v1/faculty", facultyRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/reporters", reporterRouter);
app.use("/api/v1/problems", problemRouter);
app.use("/api/v1/teams", teamRouter);

app.use((req, _res, next) => {
  next({ statusCode: 404, message: `Route not found: ${req.method} ${req.originalUrl}` });
});

app.use((err, _req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";
  let errors = err.errors || [];

  if (err.name === "ValidationError") {
    statusCode = 400;
    message = "Validation failed";
    errors = Object.values(err.errors).map((e) => e.message);
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}`;
    errors = [];
  } else if (err.code === 11000) {
    statusCode = 409;
    message = `${Object.keys(err.keyValue || {})[0] || "Value"} already exists`;
    errors = [];
  } else if (err.name === "MulterError") {
    statusCode = 400;
    message = err.code === "LIMIT_FILE_SIZE" ? "File too large (max 5 MB)" : err.message;
    errors = [];
  }

  if (statusCode === 500 && process.env.NODE_ENV === "production") {
    message = "Internal Server Error";
    errors = [];
  }

  res.status(statusCode).json({ success: false, message, errors });
});

export { app };