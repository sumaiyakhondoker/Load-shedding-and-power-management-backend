import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
	node_env: process.env.NODE_ENV,
	port: process.env.PORT || "5000",
	database_url: process.env.DATABASE_URL!,
	app_url: process.env.APP_URL!,

	bcrypt_salt_rounds: process.env.BCRYPT_SALT_ROUNDS!,
	google_client_id: process.env.GOOGLE_CLIENT_ID?.trim(),

	jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN!,
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN!,

	stripe_secret_key: process.env.STRIPE_SECRET_KEY!,
	stripe_webhook_secret: process.env.STRIPE_WEBHOOK_SECRET!,
	stripe_payment_currency: process.env.STRIPE_PAYMENT_CURRENCY,
	stripe_payment_amount: process.env.STRIPE_PAYMENT_AMOUNT,
	stripe_payment_purpose: process.env.STRIPE_PAYMENT_PURPOSE,
	stripe_success_url: process.env.STRIPE_SUCCESS_URL,
	stripe_cancel_url: process.env.STRIPE_CANCEL_URL,

	admin_name: process.env.ADMIN_NAME!,
	admin_email: process.env.ADMIN_EMAIL!,
	admin_password: process.env.ADMIN_PASSWORD!,
};
