import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const database = await PGlite.create();
const migrations = resolve("prisma/migrations");
for (const entry of (await readdir(migrations, { withFileTypes: true }))
	.filter((item) => item.isDirectory())
	.sort((a, b) => a.name.localeCompare(b.name))) {
	await database.exec(
		await readFile(resolve(migrations, entry.name, "migration.sql"), "utf8"),
	);
}
const databaseServer = new PGLiteSocketServer({
	db: database,
	port: 0,
	host: "127.0.0.1",
	maxConnections: 12,
});
await databaseServer.start();

const frontendOrigin = "https://load-shedding-frontend-assignment-7.vercel.app";
const demoDatabaseUrl = `postgresql://postgres:postgres@${databaseServer.getServerConn()}?sslmode=disable`;
const testPassword = randomBytes(24).toString("base64url");
Object.assign(process.env, {
	NODE_ENV: "test",
	DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/live",
	DEMO_DATABASE_URL: demoDatabaseUrl,
	DEMO_ACCOUNTS_ENABLED: "true",
	DEMO_ADMIN_EMAIL: "demo-admin@test.example",
	DEMO_ADMIN_PASSWORD: testPassword,
	DEMO_TECHNICIAN_EMAIL: "demo-technician@test.example",
	DEMO_TECHNICIAN_PASSWORD: testPassword,
	DEMO_CUSTOMER_EMAIL: "demo-customer@test.example",
	DEMO_CUSTOMER_PASSWORD: testPassword,
	APP_URL: frontendOrigin,
	GOOGLE_CLIENT_ID: "gridline-auth-test-client",
	JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
	JWT_REFRESH_SECRET: randomBytes(32).toString("hex"),
	JWT_ACCESS_EXPIRES_IN: "15m",
	JWT_REFRESH_EXPIRES_IN: "1d",
	BCRYPT_SALT_ROUNDS: "4",
});

const googlePayloads = new Map();
class TestOAuth2Client {
	async verifyIdToken({ idToken, audience }) {
		assert.equal(audience, process.env.GOOGLE_CLIENT_ID);
		const payload = googlePayloads.get(idToken);
		if (!payload) throw new Error("Invalid test token");
		return { getPayload: () => payload };
	}
}
mock.module("google-auth-library", {
	namedExports: { OAuth2Client: TestOAuth2Client },
});

const load = (path) => import(pathToFileURL(resolve(path)).href);
const [
	{ default: app },
	{ prisma },
	configModule,
	seedModule,
	jwtModule,
	bcryptModule,
	jwtPackage,
] =
	await Promise.all([
		load("src/app.ts"),
		load("src/app/lib/prisma.ts"),
		load("src/config/index.ts"),
		load("src/app/utils/seed.ts"),
		load("src/app/utils/jwt.ts"),
		import("bcrypt"),
		import("jsonwebtoken"),
	]);
const config = configModule.default;
const { seedDemoUsers } = seedModule;
const { createAccessToken } = jwtModule;
const bcrypt = bcryptModule.default;
const jwt = jwtPackage.default;

const tokenFor = (email, overrides = {}) => {
	const idToken = `google-${randomUUID()}`;
	googlePayloads.set(idToken, {
		iss: "https://accounts.google.com",
		aud: process.env.GOOGLE_CLIENT_ID,
		exp: Math.floor(Date.now() / 1000) + 3600,
		sub: `google-sub-${randomUUID()}`,
		email,
		email_verified: true,
		name: "Gridline Assessment User",
		...overrides,
	});
	return idToken;
};

test("Google sign-in, demo roles, session cookies, and authorization", async (t) => {
	await prisma.$connect();
	await seedDemoUsers();
	const server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	const base = `http://127.0.0.1:${server.address().port}/api/v1`;
	t.after(async () => {
		server.close();
		await prisma.$disconnect();
		await databaseServer.stop();
		await database.close();
	});

	const request = async (path, { method = "GET", body, headers = {} } = {}) => {
		const response = await fetch(`${base}${path}`, {
			method,
			headers: {
				...headers,
				...(body !== undefined ? { "content-type": "application/json" } : {}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return {
			status: response.status,
			data: await response.json(),
			cookie: response.headers.get("set-cookie"),
			headers: response.headers,
		};
	};
	const google = (idToken, headers = {}) =>
		request("/auth/google", { method: "POST", body: { idToken }, headers });
	const demo = (role) => request("/auth/demo", { method: "POST", body: { role } });
	const bearer = (user) => ({
		authorization: `Bearer ${createAccessToken(user.id, user.role)}`,
	});
	const sampleOutageId = "c2dfe09b-2aa4-49d4-8e42-3ef15715a006";
	const sampleAreaId = "c2dfe09b-2aa4-49d4-8e42-3ef15715a004";

	await t.test("rejects invalid, expired, wrong-audience, wrong-issuer, and unverified Google tokens", async () => {
		assert.equal((await google("missing-test-token")).status, 401);
		assert.equal(
			(await google(tokenFor("expired@test.example", { exp: 1 }))).status,
			401,
		);
		assert.equal(
			(
				await google(
					tokenFor("audience@test.example", { aud: "another-google-client" }),
				)
			).status,
			401,
		);
		assert.equal(
			(
				await google(
					tokenFor("issuer@test.example", { iss: "https://attacker.example" }),
				)
			).status,
			401,
		);
		assert.equal(
			(
				await google(
					tokenFor("unverified@test.example", { email_verified: false }),
				)
			).status,
			401,
		);
		assert.equal(await prisma.user.count(), 3);
	});

	await t.test("creates only a CUSTOMER and returns the normal auth response", async () => {
		const idToken = tokenFor("Google.Customer@test.example");
		const response = await google(idToken);
		assert.equal(response.status, 200);
		assert.equal(response.data.data.user.role, "CUSTOMER");
		assert.ok(response.data.data.accessToken);
		assert.match(response.cookie ?? "", /HttpOnly/i);
		const repeat = await google(idToken);
		assert.equal(repeat.data.data.user.id, response.data.data.user.id);
	});

	await t.test("does not link by email without authenticating the existing account", async () => {
		const passwordHash = await bcrypt.hash(testPassword, 4);
		const existing = await prisma.user.create({
			data: {
				name: "Existing customer",
				email: "existing-customer@test.example",
				passwordHash,
				role: "CUSTOMER",
			},
		});
		const idToken = tokenFor(existing.email);
		assert.equal((await google(idToken)).status, 409);
		assert.equal(
			(await prisma.user.findUniqueOrThrow({ where: { id: existing.id } }))
				.googleId,
			null,
		);
		const linked = await google(idToken, bearer(existing));
		assert.equal(linked.status, 200);
		assert.equal(linked.data.data.user.id, existing.id);
		assert.ok(
			(await prisma.user.findUniqueOrThrow({ where: { id: existing.id } }))
				.googleId,
		);
	});

	await t.test("seeds all three demo roles and sample records idempotently", async () => {
		const before = await prisma.user.findUniqueOrThrow({
			where: { email: process.env.DEMO_ADMIN_EMAIL },
		});
		await seedDemoUsers();
		const after = await prisma.user.findUniqueOrThrow({
			where: { email: process.env.DEMO_ADMIN_EMAIL },
		});
		assert.equal(after.passwordHash, before.passwordHash);
		assert.equal(
			await prisma.user.count({
				where: {
					email: {
						in: [
							process.env.DEMO_ADMIN_EMAIL,
							process.env.DEMO_TECHNICIAN_EMAIL,
							process.env.DEMO_CUSTOMER_EMAIL,
						],
					},
				},
			}),
			3,
		);
		assert.equal(await prisma.area.count({ where: { id: sampleAreaId } }), 1);
		assert.equal(
			await prisma.loadSheddingSchedule.count({
				where: { id: "c2dfe09b-2aa4-49d4-8e42-3ef15715a005" },
			}),
			1,
		);
	});

	const roleLogins = {};
	await t.test("demo login authenticates ADMIN, TECHNICIAN, and CUSTOMER and audits successes", async () => {
		for (const role of ["ADMIN", "TECHNICIAN", "CUSTOMER"]) {
			const response = await demo(role);
			assert.equal(response.status, 200);
			assert.equal(response.data.data.user.role, role);
			assert.ok(response.data.data.accessToken);
			assert.match(response.cookie ?? "", /HttpOnly/i);
			roleLogins[role] = response.data.data;
		}
		assert.equal(
			await prisma.auditLog.count({ where: { action: "DEMO_LOGIN" } }),
			3,
		);
		assert.equal(
			(await request("/auth/demo", { method: "POST", body: { role: "ROOT" } }))
				.status,
			400,
		);
	});

	await t.test("demo login stays disabled when the feature flag is off", async () => {
		config.demo_accounts_enabled = false;
		const response = await demo("CUSTOMER");
		config.demo_accounts_enabled = true;
		assert.equal(response.status, 404);
	});

	await t.test("demo login rejects a configured password that does not match the seeded account", async () => {
		const originalPassword = config.demo_customer.password;
		config.demo_customer.password = randomBytes(24).toString("base64url");
		try {
			assert.equal((await demo("CUSTOMER")).status, 503);
		} finally {
			config.demo_customer.password = originalPassword;
		}
	});

	await t.test("enforces role boundaries and customer/technician resource ownership", async () => {
		const admin = roleLogins.ADMIN.user;
		const technician = roleLogins.TECHNICIAN.user;
		const customer = roleLogins.CUSTOMER.user;
		for (const user of [admin, technician, customer]) {
			assert.equal(
				(await request("/users/me", { headers: bearer(user) })).status,
				200,
			);
		}
		const legacyAccessToken = jwt.sign(
			{ userId: customer.id, role: customer.role },
			process.env.JWT_ACCESS_SECRET,
			{ expiresIn: "5m" },
		);
		assert.equal(
			(
				await request("/users/me", {
					headers: { authorization: `Bearer ${legacyAccessToken}` },
				})
			).status,
			200,
		);
		assert.equal(
			(await request("/admin/dashboard-stats", { headers: bearer(admin) }))
				.status,
			200,
		);
		assert.equal(
			(await request("/admin/dashboard-stats", { headers: bearer(technician) }))
				.status,
			403,
		);
		assert.equal(
			(await request("/admin/audit-logs", { headers: bearer(customer) })).status,
			403,
		);
		assert.equal(
			(
				await request("/distribution-zones", {
					method: "POST",
					body: { name: "Protected zone" },
					headers: bearer(customer),
				})
			).status,
			403,
		);
		const schedules = await request("/schedules", { headers: bearer(customer) });
		assert.equal(schedules.status, 200);
		assert.equal(
			schedules.data.data.schedules.some(
				(schedule) => schedule.title === "Assessment Sample Schedule",
			),
			true,
		);

		const customerReports = await request("/outage-reports", {
			headers: bearer(customer),
		});
		assert.deepEqual(
			customerReports.data.data.reports.map((report) => report.id),
			[sampleOutageId],
		);
		const technicianReports = await request("/outage-reports", {
			headers: bearer(technician),
		});
		assert.deepEqual(
			technicianReports.data.data.reports.map((report) => report.id),
			[sampleOutageId],
		);
		const otherCustomer = await prisma.user.create({
			data: {
				name: "Other assessment customer",
				email: "other-customer@test.example",
				role: "CUSTOMER",
			},
		});
		const otherReport = await prisma.outageReport.create({
			data: {
				areaId: sampleAreaId,
				reportedById: otherCustomer.id,
				title: "Private customer report",
				description: "Must not be visible to the demo customer.",
				reportedAt: new Date(),
			},
		});
		assert.equal(
			(
				await request(`/outage-reports/${otherReport.id}`, {
					headers: bearer(customer),
				})
			).status,
			404,
		);
		assert.equal(
			(
				await request("/outage-reports", {
					method: "POST",
					body: {
						areaId: sampleAreaId,
						title: "Assessment report",
						description: "Created by the sample customer.",
					},
					headers: bearer(customer),
				})
			).status,
			201,
		);
		assert.equal(
			(
				await request(`/outage-reports/${sampleOutageId}/status`, {
					method: "PATCH",
					body: { status: "IN_PROGRESS" },
					headers: bearer(technician),
				})
			).status,
			200,
		);
		assert.equal(
			(
				await request(`/outage-reports/${sampleOutageId}/status`, {
					method: "PATCH",
					body: {
						status: "RESOLVED",
						resolutionNote: "Assessment task completed.",
					},
					headers: bearer(technician),
				})
			).status,
			200,
		);
		assert.equal(
			(await request("/payments", { headers: bearer(technician) })).status,
			403,
		);
		assert.equal(
			(await request("/payments", { headers: bearer(customer) })).status,
			200,
		);
	});

	await t.test("uses secure cross-origin cookies and protects refresh/logout with Origin checks", async () => {
		config.node_env = "production";
		const login = await demo("CUSTOMER");
		const cookiePair = login.cookie?.split(";")[0];
		assert.ok(cookiePair);
		assert.match(login.cookie, /SameSite=None/i);
		assert.match(login.cookie, /Secure/i);
		assert.match(login.cookie, /HttpOnly/i);

		const refreshed = await request("/auth/refresh-token", {
			method: "POST",
			headers: { origin: frontendOrigin, cookie: cookiePair },
		});
		assert.equal(refreshed.status, 200);
		assert.ok(refreshed.data.data.accessToken);
		assert.equal(
			(
				await request("/auth/refresh-token", {
					method: "POST",
					headers: { cookie: cookiePair },
				})
			).status,
			403,
		);
		assert.equal(
			(
				await request("/auth/refresh-token", {
					method: "POST",
					headers: {
						origin: frontendOrigin,
						cookie: `refreshToken=${createAccessToken(
							roleLogins.CUSTOMER.user.id,
							"CUSTOMER",
						)}`,
					},
				})
			).status,
			401,
		);
		const logout = await request("/auth/logout", {
			method: "POST",
			headers: { origin: frontendOrigin, cookie: cookiePair },
		});
		assert.equal(logout.status, 200);
		assert.match(logout.cookie ?? "", /Expires=Thu, 01 Jan 1970/i);
		assert.match(logout.cookie ?? "", /SameSite=None/i);
		assert.match(logout.cookie ?? "", /Secure/i);
		config.node_env = "test";
	});

	await t.test("rate limits repeated demo login requests", async () => {
		let response;
		for (let attempt = 0; attempt < 15; attempt++) {
			response = await demo("CUSTOMER");
			if (response.status === 429) break;
		}
		assert.equal(response.status, 429);
	});
});
