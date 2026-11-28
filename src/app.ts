import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type Application } from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AdminRoutes } from "./app/module/admin/admin.route";
import { AreaRoutes } from "./app/module/area/area.route";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { BillRoutes } from "./app/module/bill/bill.route";
import { FeederRoutes } from "./app/module/feeder/feeder.route";
import { OutageReportRoutes } from "./app/module/outageReport/outageReport.route";
import {
	PaymentRoutes,
	PaymentWebhookRoutes,
} from "./app/module/payment/payment.route";
import { TariffRoutes } from "./app/module/tariff/tariff.route";
import { ScheduleRoutes } from "./app/module/schedule/schedule.route";

import { UserRoutes } from "./app/module/user/user.route";
import { SubstationRoutes } from "./app/module/substation/substation.route";
import { AppError } from "./app/utils/AppError";
import { sendResponse } from "./app/utils/sendResponse";
import { DistributionZoneRoutes } from "./app/module/distributionZone/distributionZone.route";
import config from "./config";

const app: Application = express();
const trustedFrontendOrigin = new URL(config.app_url).origin;

app.set("trust proxy", 1);
app.use(helmet());

app.use(
	cors({
		origin: trustedFrontendOrigin,
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
		allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
	}),
);

app.use("/api/v1/payments", PaymentWebhookRoutes);

app.use(
	"/api",
	rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 100,
		standardHeaders: "draft-8",
		legacyHeaders: false,
		handler: (req, res, next) => next(new AppError(429, "Too many requests")),
	}),
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
app.use("/api/v1/bills", BillRoutes);
app.use("/api/v1/tariffs", TariffRoutes);
app.use("/api/v1/users", UserRoutes);
app.use("/api/v1/admin", AdminRoutes);
app.use("/api/v1/distribution-zones", DistributionZoneRoutes);
app.use("/api/v1/substations", SubstationRoutes);
app.use("/api/v1/feeders", FeederRoutes);
app.use("/api/v1/areas", AreaRoutes);
app.use("/api/v1/schedules", ScheduleRoutes);
app.use("/api/v1/outage-reports", OutageReportRoutes);
app.use("/api/v1/payments", PaymentRoutes);

app.use(notFound);
app.use(globalErrorHandler);

export default app;
