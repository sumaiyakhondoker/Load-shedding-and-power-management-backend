import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { mock, test } from "node:test";
import { pathToFileURL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import Stripe from "stripe";

const database = await PGlite.create();
const migrations = resolve("prisma/migrations");
for (const entry of (await readdir(migrations, { withFileTypes: true }))
	.filter((item) => item.isDirectory())
	.sort((a, b) => a.name.localeCompare(b.name))) {
	await database.exec(await readFile(resolve(migrations, entry.name, "migration.sql"), "utf8"));
}
const databaseServer = new PGLiteSocketServer({
	db: database,
	port: 0,
	host: "127.0.0.1",
	maxConnections: 12,
});
await databaseServer.start();

Object.assign(process.env, {
	NODE_ENV: "test",
	DATABASE_URL: `postgresql://postgres:postgres@${databaseServer.getServerConn()}/postgres?sslmode=disable`,
	APP_URL: "http://localhost:3000",
	JWT_ACCESS_SECRET: "test-access-secret",
	JWT_REFRESH_SECRET: "test-refresh-secret",
	JWT_ACCESS_EXPIRES_IN: "15m",
	JWT_REFRESH_EXPIRES_IN: "1d",
	STRIPE_SECRET_KEY: "sk_test_local_mock",
	STRIPE_WEBHOOK_SECRET: "whsec_local_mock",
	STRIPE_PAYMENT_CURRENCY: "usd",
	STRIPE_PAYMENT_AMOUNT: "1.25",
	STRIPE_PAYMENT_PURPOSE: "Voluntary outage reporting support contribution",
	STRIPE_SUCCESS_URL: "http://localhost:3000/payment/success",
	STRIPE_CANCEL_URL: "http://localhost:3000/payment/cancel",
});

const sessions = new Map();
let createCalls = 0;
class TestStripe {
	static errors = Stripe.errors;
	webhooks = new Stripe("sk_test_local_mock").webhooks;
	checkout = {
		sessions: {
			create: async (params, options) => {
				createCalls++;
				const existing = sessions.get(options.idempotencyKey);
				if (existing) return existing;
				const session = {
					id: `cs_test_${randomUUID()}`,
					object: "checkout.session",
					status: "open",
					payment_status: "unpaid",
					url: "https://checkout.stripe.com/test-session",
					metadata: params.metadata,
					client_reference_id: params.client_reference_id,
					amount_total: params.line_items[0].price_data.unit_amount,
					currency: params.line_items[0].price_data.currency,
				};
				assert.equal(params.success_url.includes("{CHECKOUT_SESSION_ID}"), true);
				sessions.set(options.idempotencyKey, session);
				return session;
			},
			retrieve: async (id) => [...sessions.values()].find((session) => session.id === id),
		},
	};
}
mock.module("stripe", { defaultExport: TestStripe });

const load = (path) => import(pathToFileURL(resolve(path)).href);
const { default: app } = await load("src/app.ts");
const { prisma } = await load("src/app/lib/prisma.ts");
const { createAccessToken } = await load("src/app/utils/jwt.ts");

test("Stripe payment endpoints", async (t) => {
	const server = app.listen(0, "127.0.0.1");
	await once(server, "listening");
	t.after(async () => {
		server.close();
		await prisma.$disconnect();
		await databaseServer.stop();
		await database.close();
	});
	const base = `http://127.0.0.1:${server.address().port}/api/v1/payments`;
	const customer = await prisma.user.create({ data: { name: "Customer", email: "customer@test.example", role: "CUSTOMER" } });
	const other = await prisma.user.create({ data: { name: "Other", email: "other@test.example", role: "CUSTOMER" } });
	const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@test.example", role: "ADMIN" } });
	const auth = (user) => ({ authorization: `Bearer ${createAccessToken(user.id, user.role)}` });
	const request = async (path, { method = "GET", body, headers = {} } = {}) => {
		const response = await fetch(`${base}${path}`, {
			method,
			headers: { ...headers, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return { status: response.status, data: await response.json() };
	};
	const initiate = (key, body = {}, user = customer) => request("/initiate", {
		method: "POST", body, headers: { ...auth(user), "idempotency-key": key },
	});
	const createBill = async (month, owner = customer) => {
		const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/bills`, {
			method: "POST", headers: { ...auth(admin), "content-type": "application/json" },
			body: JSON.stringify({ customerId: owner.id, billingMonth: month, billingYear: 2027, previousMeterReading: "10", currentMeterReading: "11", ratePerUnit: "1.25", additionalCharges: "0", issueDate: "2026-11-01", dueDate: "2028-01-01" }),
		});
		assert.equal(response.status, 201);
		return (await response.json()).data;
	};
	const primaryBill = await createBill(1);
	const webhook = async (session, type, signed = true) => {
		const payload = JSON.stringify({
			id: `evt_${randomUUID()}`, object: "event", livemode: false,
			type, data: { object: session },
		});
		const signature = signed
			? Stripe.webhooks.generateTestHeaderString({ payload, secret: process.env.STRIPE_WEBHOOK_SECRET })
			: "invalid";
		return request("/webhook", { method: "POST", body: JSON.parse(payload), headers: { "stripe-signature": signature } });
	};
	await t.test("public registration rejects technician role and browser preflight permits idempotency key", async () => {
		const registration = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/auth/register`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "Untrusted", email: "untrusted@test.example", password: "password123", role: "TECHNICIAN" }),
		});
		assert.equal(registration.status, 400);
		assert.equal(await prisma.user.count({ where: { email: "untrusted@test.example" } }), 0);
		const preflight = await fetch(`${base}/initiate`, {
			method: "OPTIONS",
			headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key" },
		});
		assert.equal(preflight.status, 204);
		assert.match(preflight.headers.get("access-control-allow-headers") ?? "", /Idempotency-Key/i);
	});

	await t.test("requires customer authentication and rejects client supplied payment fields", async () => {
		assert.equal((await request("/initiate", { method: "POST", body: {}, headers: { "idempotency-key": randomUUID() } })).status, 401);
		assert.equal((await initiate(randomUUID(), { amount: "0.01" })).status, 400);
		assert.equal((await initiate(randomUUID(), {})).status, 400);
		assert.equal((await initiate(randomUUID(), { billId: randomUUID() })).status, 404);
		assert.equal((await initiate(randomUUID(), { billId: primaryBill.id }, admin)).status, 403);
	});

	const key = randomUUID();
	const first = await initiate(key, { billId: primaryBill.id });
	await t.test("creates a pending record and reuses the simulated checkout on retry", async () => {
		assert.equal(first.status, 201);
		assert.equal(first.data.data.paymentId, key);
		assert.equal(first.data.data.checkoutUrl, "https://checkout.stripe.com/test-session");
		const payment = await prisma.payment.findUniqueOrThrow({ where: { id: key } });
		assert.equal(payment.status, "PENDING");
		assert.equal(payment.amount.toString(), "1.25");
		assert.equal(payment.currency, "USD");
		assert.equal(payment.gatewayTransactionId, first.data.data.sessionId);
		assert.equal(payment.billId, primaryBill.id);
		assert.equal((await initiate(key, { billId: primaryBill.id })).data.data.sessionId, payment.gatewayTransactionId);
		assert.equal(createCalls, 1);
		assert.equal((await initiate(randomUUID(), { billId: primaryBill.id })).status, 409);
		assert.equal((await initiate(key, { billId: primaryBill.id }, other)).status, 409);
	});
	await t.test("enforces ownership and admin visibility", async () => {
		assert.equal((await request(`/${key}`, { headers: auth(other) })).status, 404);
		assert.equal((await request(`/${key}`, { headers: auth(customer) })).data.data.status, "PENDING");
		assert.equal((await request("/?status=PENDING", { headers: auth(customer) })).data.data.meta.total, 1);
		assert.equal((await request("/", { headers: auth(other) })).data.data.meta.total, 0);
		assert.equal((await request("/", { headers: auth(admin) })).data.data.meta.total, 1);
		assert.equal((await request("/?status=NOT_A_STATUS", { headers: auth(admin) })).status, 400);
	});
	await t.test("rejects unsigned events and accepts signed paid and duplicate events", async () => {
		const session = { ...sessions.get(key), payment_status: "paid", status: "complete" };
		assert.equal((await webhook(session, "checkout.session.completed", false)).status, 400);
		assert.equal((await webhook({ ...session, amount_total: 1 }, "checkout.session.completed")).status, 400);
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: key } })).status, "PENDING");
		assert.equal((await webhook(session, "checkout.session.completed")).status, 200);
		assert.equal((await webhook(session, "checkout.session.completed")).status, 200);
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: key } })).status, "PAID");
		assert.equal((await prisma.electricityBill.findUniqueOrThrow({ where: { id: primaryBill.id } })).status, "PAID");
		assert.equal((await webhook(session, "checkout.session.expired")).status, 200);
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: key } })).status, "PAID");
	});
	await t.test("expiration marks only the matching pending payment cancelled", async () => {
		const secondKey = randomUUID();
		const bill = await createBill(2);
		assert.equal((await initiate(secondKey, { billId: bill.id })).status, 201);
		const session = { ...sessions.get(secondKey), status: "expired" };
		assert.equal((await webhook(session, "checkout.session.expired")).status, 200);
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: secondKey } })).status, "CANCELLED");
		assert.equal((await prisma.electricityBill.findUniqueOrThrow({ where: { id: bill.id } })).status, "UNPAID");
		assert.equal((await initiate(randomUUID(), { billId: bill.id })).status, 201);
	});
	await t.test("asynchronous failure is recorded and redirects do not change payment status", async () => {
		const failedKey = randomUUID();
		const bill = await createBill(3);
		assert.equal((await initiate(failedKey, { billId: bill.id })).status, 201);
		const failedSession = { ...sessions.get(failedKey), status: "complete" };
		assert.equal((await webhook(failedSession, "checkout.session.async_payment_failed")).status, 200);
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: failedKey } })).status, "FAILED");
		assert.equal((await prisma.electricityBill.findUniqueOrThrow({ where: { id: bill.id } })).status, "UNPAID");
		for (const path of ["/payment/success", "/payment/cancel"]) {
			const response = await fetch(`http://127.0.0.1:${server.address().port}${path}?session_id=${failedSession.id}`);
			assert.equal(response.status, 404);
		}
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: failedKey } })).status, "FAILED");
	});
	await t.test("outage reporting stays free and only owned reports can be associated", async () => {
		const zone = await prisma.distributionZone.create({ data: { name: "Test zone" } });
		const substation = await prisma.substation.create({ data: { zoneId: zone.id, name: "Test substation", code: "TEST" } });
		const feeder = await prisma.feeder.create({ data: { substationId: substation.id, name: "Test feeder", code: "TEST" } });
		const area = await prisma.area.create({ data: { feederId: feeder.id, name: "Test area" } });
		const reportResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/outage-reports`, {
			method: "POST",
			headers: { ...auth(customer), "content-type": "application/json" },
			body: JSON.stringify({ areaId: area.id, title: "Power outage", description: "No power today" }),
		});
		assert.equal(reportResponse.status, 201);
		const report = (await reportResponse.json()).data;
		assert.equal((await prisma.payment.count({ where: { userId: customer.id, outageReportId: report.id } })), 0);
		assert.equal((await initiate(randomUUID(), { outageReportId: report.id }, other)).status, 400);
		assert.equal((await initiate(randomUUID(), { outageReportId: report.id })).status, 400);
		for (const path of ["/api/v1/schedules", "/api/v1/outage-reports"]) {
			const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: auth(customer) });
			assert.equal(response.status, 200);
		}
	});
	await t.test("does not recreate an uncertain checkout after Stripe's retry window", async () => {
		const oldKey = randomUUID();
		const bill = await createBill(4);
		await prisma.payment.create({
			data: {
				id: oldKey,
				userId: customer.id,
				billId: bill.id,
				amount: "1.25",
				currency: "USD",
				gateway: "STRIPE",
				status: "PENDING",
				purpose: "Voluntary outage reporting support contribution",
				createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
			},
		});
		assert.equal((await initiate(oldKey, { billId: bill.id })).status, 409);
		assert.equal((await prisma.payment.findUniqueOrThrow({ where: { id: oldKey } })).gatewayTransactionId, null);
	});
	await t.test("enforces bill ownership, duplicate periods, status transitions, and server-calculated amounts", async () => {
		const bill = await createBill(5);
		assert.equal(bill.consumedUnits, "1");
		assert.equal(bill.totalAmount, "1.25");
		const duplicate = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/bills`, {
			method: "POST", headers: { ...auth(admin), "content-type": "application/json" },
			body: JSON.stringify({ customerId: customer.id, billingMonth: 5, billingYear: 2027, previousMeterReading: "10", currentMeterReading: "11", ratePerUnit: "1.25", issueDate: "2026-11-01", dueDate: "2028-01-01" }),
		});
		assert.equal(duplicate.status, 409);
		const billUrl = `http://127.0.0.1:${server.address().port}/api/v1/bills`;
		assert.equal((await fetch(`${billUrl}/${bill.id}`, { headers: auth(other) })).status, 404);
		assert.equal((await fetch(`${billUrl}/my-bills`, { headers: auth(customer) })).status, 200);
		const summary = await fetch(`${billUrl}/summary`, { headers: auth(customer) });
		assert.equal(summary.status, 200);
		assert.ok(Number((await summary.json()).data.outstandingBalance) >= 1.25);
		assert.equal((await fetch(`${billUrl}?search=${bill.billNumber}`, { headers: auth(admin) })).status, 200);
		assert.equal((await fetch(billUrl, { headers: auth(customer) })).status, 403);
		const update = await fetch(`${billUrl}/${bill.id}`, { method: "PATCH", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ currentMeterReading: "12" }) });
		assert.equal(update.status, 200);
		assert.equal((await update.json()).data.totalAmount, "2.5");
		const cancelled = await fetch(`${billUrl}/${bill.id}/cancel`, { method: "PATCH", headers: auth(admin) });
		assert.equal(cancelled.status, 200);
		assert.equal((await initiate(randomUUID(), { billId: bill.id })).status, 409);
		assert.equal((await fetch(`${billUrl}/${bill.id}`, { method: "PATCH", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ currentMeterReading: "13" }) })).status, 409);
	});
	await t.test("allows only one pending checkout per bill", async () => {
		const bill = await createBill(6);
		const results = await Promise.all([initiate(randomUUID(), { billId: bill.id }), initiate(randomUUID(), { billId: bill.id })]);
		assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
		assert.equal(await prisma.payment.count({ where: { billId: bill.id, status: "PENDING" } }), 1);
	});
	await t.test("verified webhook recovers a session ID not saved after checkout creation", async () => {
		const bill = await createBill(7);
		const key = randomUUID();
		assert.equal((await initiate(key, { billId: bill.id })).status, 201);
		await prisma.payment.update({ where: { id: key }, data: { gatewayTransactionId: null } });
		const session = { ...sessions.get(key), status: "complete", payment_status: "paid" };
		assert.equal((await webhook(session, "checkout.session.completed")).status, 200);
		const payment = await prisma.payment.findUniqueOrThrow({ where: { id: key } });
		assert.equal(payment.gatewayTransactionId, session.id);
		assert.equal(payment.status, "PAID");
		assert.equal((await prisma.electricityBill.findUniqueOrThrow({ where: { id: bill.id } })).status, "PAID");
	});
	await t.test("identifies overdue bills and prevents edits while checkout is pending", async () => {
		const billUrl = `http://127.0.0.1:${server.address().port}/api/v1/bills`;
		const created = await fetch(billUrl, {
			method: "POST", headers: { ...auth(admin), "content-type": "application/json" },
			body: JSON.stringify({ customerId: customer.id, billingMonth: 8, billingYear: 2027, previousMeterReading: "4", currentMeterReading: "6", ratePerUnit: "0.75", issueDate: "2026-01-01", dueDate: "2026-02-01" }),
		});
		assert.equal(created.status, 201);
		const bill = (await created.json()).data;
		assert.equal(bill.status, "OVERDUE");
		assert.equal((await initiate(randomUUID(), { billId: bill.id })).status, 201);
		assert.equal((await fetch(`${billUrl}/${bill.id}/cancel`, { method: "PATCH", headers: auth(admin) })).status, 409);
		assert.equal((await fetch(`${billUrl}/${bill.id}`, { method: "PATCH", headers: { ...auth(admin), "content-type": "application/json" }, body: JSON.stringify({ ratePerUnit: "1.00" }) })).status, 409);
		const listed = await fetch(`${billUrl}/my-bills?status=OVERDUE`, { headers: auth(customer) });
		assert.equal(listed.status, 200);
		assert.ok((await listed.json()).data.bills.some((item) => item.id === bill.id));
	});
});
