import jwt, { type SignOptions } from "jsonwebtoken";
import config from "../../config";

export const createAccessToken = (userId: string, role: string) => {
	if (!config.jwt_access_secret) {
		throw new Error("JWT access secret is missing");
	}

	return jwt.sign({ userId, role, type: "access" }, config.jwt_access_secret, {
		expiresIn: config.jwt_access_expires_in as SignOptions["expiresIn"],
		algorithm: "HS256",
	});
};

export const createRefreshToken = (userId: string) => {
	if (!config.jwt_refresh_secret) {
		throw new Error("JWT refresh secret is missing");
	}

	return jwt.sign({ userId, type: "refresh" }, config.jwt_refresh_secret, {
		expiresIn: config.jwt_refresh_expires_in as SignOptions["expiresIn"],
		algorithm: "HS256",
	});
};
