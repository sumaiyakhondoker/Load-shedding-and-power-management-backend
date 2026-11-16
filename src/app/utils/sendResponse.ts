import type { Response } from "express";

type ResponseOptions<T> = {
  res: Response;
  statusCode: number;
  message: string;
  data: T;
};

export const sendResponse = <T>({ res, statusCode, message, data }: ResponseOptions<T>) => {
  res.status(statusCode).json({ success: true, message, data });
};
