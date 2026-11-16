import jwt, { type SignOptions } from "jsonwebtoken";
import config from "../../config";

export const createAccessToken = (userId: string, role: string) => {
  if (!config.jwt_access_secret) {
    throw new Error("JWT access secret is missing");
  }

  return jwt.sign({ userId, role }, config.jwt_access_secret, {
    expiresIn: config.jwt_access_expires_in as SignOptions["expiresIn"],
  });
};
