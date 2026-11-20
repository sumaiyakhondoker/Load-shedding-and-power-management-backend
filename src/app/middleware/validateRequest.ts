import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export const validateRequest = (schema: ZodType): RequestHandler => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: result.error.issues.map((issue) => ({
  field:
    issue.code === "unrecognized_keys"
      ? issue.keys.join(", ")
      : issue.path.join("."),
  message:
    issue.code === "unrecognized_keys"
      ? "This field is not allowed"
      : issue.message,
})),
      });
      return;
    }

    req.body = result.data;
    next();
  };
};
