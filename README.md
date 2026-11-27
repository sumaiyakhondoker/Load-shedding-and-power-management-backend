# GRIDLINE backend

Express, Prisma, PostgreSQL, Google sign-in, and Stripe Checkout in Test Mode.

## Configuration

Copy the names in `.env.example` into `.env`. Supply the existing database, JWT, admin, `APP_URL`, and Google settings as needed. For payments, set `STRIPE_SECRET_KEY=sk_test_...`, `STRIPE_WEBHOOK_SECRET=whsec_...`, `STRIPE_PAYMENT_CURRENCY=USD`, a fixed `STRIPE_PAYMENT_AMOUNT` (for example `1.25`), and a nonempty `STRIPE_PAYMENT_PURPOSE` describing a voluntary support contribution. Set `STRIPE_SUCCESS_URL` to the frontend `/payment/success` URL and `STRIPE_CANCEL_URL` to `/payment/cancel`. The backend adds `session_id={CHECKOUT_SESSION_ID}` to the success URL. Do not put secrets or demo passwords in Git.

Run `pnpm install`, apply the existing Prisma migrations, then `pnpm dev`. For local webhook forwarding, run `stripe login` and `stripe listen --forward-to localhost:5000/api/v1/payments/webhook`. Copy the listener's `whsec_...` value to `.env` and restart the backend. Use a Stripe test card in Checkout; the frontend success redirect alone never marks a payment paid. The verified webhook updates payment status. The cancel redirect only shows the current backend status; an expired Checkout session later becomes `CANCELLED` after its Stripe event.

For a deployed frontend, set `APP_URL` to its exact origin so CORS permits credentialed requests. Browser requests that use refresh or logout must send credentials and the frontend origin. The refresh token is only in an HTTP-only cookie; production uses `SameSite=None; Secure` for the separate Vercel frontend and backend origins, while local development uses `SameSite=Lax`. Refresh and logout reject requests without the exact trusted `Origin`. Browsers that block third-party cookies may not restore a session across separate sites; use a same-origin frontend proxy/BFF in that case. Never copy refresh tokens into browser storage.

## Payment API

All customer and admin requests use `Authorization: Bearer <accessToken>`. `POST /api/v1/payments/initiate` is CUSTOMER only and additionally needs `Idempotency-Key: <new UUID>`. Send `{}` or `{ "outageReportId": "<owned report UUID>" }`. The server supplies amount, currency, and purpose. Retry an uncertain request with the **same** key. A successful response is `201` with `{ "success": true, "message": "Checkout session created successfully", "data": { "paymentId": "uuid", "checkoutUrl": "https://checkout.stripe.com/...", "sessionId": "cs_test_..." } }`.

`GET /api/v1/payments?page=1&limit=10&status=PENDING` lists only the customer's payments, or all payments for an ADMIN. Its `data` contains `payments` and `meta: { page, limit, total, totalPages }`. `GET /api/v1/payments/:id` returns one payment; another customer's payment returns 404. TECHNICIAN cannot use these endpoints. Payment records expose `id`, `userId`, `outageReportId`, `amount`, `currency`, `gateway`, `gatewayTransactionId`, `status`, `purpose`, `createdAt`, and `updatedAt`. The session ID is stored as `gatewayTransactionId` for the frontend comparison.

`POST /api/v1/payments/webhook` receives Stripe's raw JSON and `Stripe-Signature`; it is called by Stripe and does not need a user token. Invalid signatures return 400. Successful, failed, and expired Checkout events update only the matching pending payment. Duplicate events leave a final status unchanged. The endpoint is mounted before JSON parsing.

The frontend's `apiPost` call must allow `headers` in its options type and forward `Idempotency-Key`. The current frontend `src/lib/api-client.ts` already has `headers?: HeadersInit` and forwards those headers; no frontend edit is needed for that version.

## Accounts

Public registration always creates CUSTOMER accounts. Admin role changes remain protected. Google sign-in continues to use the existing account linking flow.

`POST /api/v1/auth/google` accepts a Google Identity Services ID token as `{ "idToken": "..." }`. It verifies the signature, issuer, audience, expiry, and verified email using `GOOGLE_CLIENT_ID`. New Google accounts are always CUSTOMER accounts; an existing password account can only be linked while authenticated as that same customer.

The regular admin seed uses `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`. Demo sign-in is disabled unless `DEMO_ACCOUNTS_ENABLED=true`. When enabled, the application and seed script use `DEMO_DATABASE_URL` instead of `DATABASE_URL`; configure that URL to a separate disposable assessment database, never the live user database. Set all three demo email/password pairs. Use unique assessment accounts and passwords of at least 12 characters. The seeder creates missing accounts and synthetic area, schedule, outage, and payment records; it leaves existing passwords unchanged. Startup/seeding in demo mode does not create the regular admin account. Demo credentials are server-only and are never returned by the API. `POST /api/v1/auth/demo` accepts `{ "role": "ADMIN" | "TECHNICIAN" | "CUSTOMER" }`, has a dedicated rate limit, and records successful demo logins in the audit log.

Required authentication settings are `GOOGLE_CLIENT_ID`, `APP_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET`. Demo-only settings are `DEMO_ACCOUNTS_ENABLED=false`, `DEMO_DATABASE_URL`, and `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD`, `DEMO_TECHNICIAN_EMAIL`, `DEMO_TECHNICIAN_PASSWORD`, `DEMO_CUSTOMER_EMAIL`, and `DEMO_CUSTOMER_PASSWORD`. Never set demo credentials in frontend environment variables or commit them. Enabling demos selects the separate demo database, including in an intentionally isolated production assessment deployment.

## Verification

Run `pnpm typecheck`, `pnpm lint:check`, `pnpm build`, and `pnpm test:payment`. Import `postman/payment.postman_collection.json` to exercise payment requests. A real Checkout and signed webhook check additionally require valid Stripe Test Mode credentials, a running database, and Stripe CLI forwarding.

## Vercel deployment

`api/index.ts` is the Vercel Function entry point and imports the bundled `dist/app.js`; `src/server.ts` remains the local listener. The Vercel build command runs `pnpm build`, which generates the Prisma client before tsup bundles the Express app. The function includes `dist/**` so the built ESM app is present at runtime. No static output directory is required for this serverless API; do not configure an empty `public` directory or create one as a deployment workaround.

Configure every name in `.env.example` in the Vercel project, using production database credentials, strong JWT secrets, the deployed frontend origin for `APP_URL`, and the frontend payment success and cancel URLs. Set `NODE_ENV=production`. Stripe settings remain optional until a payment endpoint is used. Use a pooled PostgreSQL connection string suited to serverless traffic. The Prisma adapter limits each function instance to two connections. Do not run seed or migrations on each function invocation.

After confirming the intended database target and migration plan, run the existing migrations once with `pnpm exec prisma migrate deploy` in a controlled environment. Run `pnpm seed` once to create the admin account; demo seeding is disabled in production. Then deploy and verify the deployment is READY, responds to `/`, and serves `/api/v1/*` from a Vercel Function. Test the Stripe webhook using the deployed endpoint and its own `whsec_...` signing secret. The published Postman documentation may need its base URL and Stripe webhook endpoint updated to the deployment URL; the API response and payment field names remain unchanged.
