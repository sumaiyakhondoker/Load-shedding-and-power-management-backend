import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../../../generated/prisma/client";
import { AppError } from "../utils/AppError";

export const globalErrorHandler: ErrorRequestHandler = (
	error: unknown,
	req,
	res,
	next,
) => {
	if (error instanceof ZodError) {
		res.status(400).json({
			success: false,
			message: "Validation failed",
			errors: error.issues.map((issue) => ({
				field: issue.path.join("."),
				message: issue.message,
			})),
		});
		return;
	}

	if (error instanceof Prisma.PrismaClientValidationError) {
		res
			.status(400)
			.json({ success: false, message: "Invalid database input", errors: [] });
		return;
	}

	if (error instanceof Prisma.PrismaClientKnownRequestError) {
		if (error.code === "P2002") {
			res.status(409).json({
				success: false,
				message: "Duplicate value already exists",
				errors: [],
			});
			return;
		}
		if (error.code === "P2003") {
			res.status(400).json({
				success: false,
				message: "Related record constraint failed",
				errors: [],
			});
			return;
		}
		if (error.code === "P2025") {
			res
				.status(404)
				.json({ success: false, message: "Record not found", errors: [] });
			return;
		}
	}

	if (error instanceof AppError) {
		res
			.status(error.statusCode)
			.json({ success: false, message: error.message, errors: [] });
		return;
	}

	if (error instanceof SyntaxError && "body" in error) {
		res
			.status(400)
			.json({ success: false, message: "Invalid JSON body", errors: [] });
		return;
	}

	res
		.status(500)
		.json({ success: false, message: "Internal server error", errors: [] });
};
