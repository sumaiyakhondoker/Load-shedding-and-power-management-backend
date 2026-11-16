
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AdminRoutes } from "./app/module/admin/admin.route";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { UserRoutes } from "./app/module/user/user.route";
import { AppError } from "./app/utils/AppError";
import { sendResponse } from "./app/utils/sendResponse";

const app: Application = express();

const allowedOrigins = ["http://localhost:3000"];

app.use(helmet());

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (req, res, next) => next(new AppError(429, "Too many requests")),
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/", (req, res) => {
  sendResponse({
    res,
    statusCode: 200,
    message: "Welcome to Load Shedding & Power Management",
    data: null,
  });
});

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/users", UserRoutes);
app.use("/api/v1/admin", AdminRoutes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
