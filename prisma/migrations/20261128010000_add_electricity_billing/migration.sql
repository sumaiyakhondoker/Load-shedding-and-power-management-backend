CREATE TYPE "BillStatus" AS ENUM ('UNPAID', 'PAID', 'OVERDUE', 'CANCELLED');

CREATE TABLE "electricity_bills" (
    "id" UUID NOT NULL,
    "bill_number" VARCHAR(64) NOT NULL,
    "customer_id" UUID NOT NULL,
    "billing_month" SMALLINT NOT NULL,
    "billing_year" SMALLINT NOT NULL,
    "previous_meter_reading" DECIMAL(14,2) NOT NULL,
    "current_meter_reading" DECIMAL(14,2) NOT NULL,
    "consumed_units" DECIMAL(14,2) NOT NULL,
    "rate_per_unit" DECIMAL(12,4) NOT NULL,
    "additional_charges" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_amount" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'UNPAID',
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,
    CONSTRAINT "electricity_bills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "electricity_bills_readings_check" CHECK ("previous_meter_reading" >= 0 AND "current_meter_reading" >= "previous_meter_reading" AND "consumed_units" = "current_meter_reading" - "previous_meter_reading"),
    CONSTRAINT "electricity_bills_amounts_check" CHECK ("rate_per_unit" > 0 AND "additional_charges" >= 0 AND "total_amount" > 0),
    CONSTRAINT "electricity_bills_period_check" CHECK ("billing_month" BETWEEN 1 AND 12 AND "billing_year" BETWEEN 2000 AND 9999),
    CONSTRAINT "electricity_bills_dates_check" CHECK ("due_date" >= "issue_date")
);

CREATE UNIQUE INDEX "electricity_bills_bill_number_key" ON "electricity_bills"("bill_number");
CREATE UNIQUE INDEX "electricity_bills_customer_id_billing_year_billing_month_key" ON "electricity_bills"("customer_id", "billing_year", "billing_month");
CREATE INDEX "electricity_bills_customer_id_status_due_date_idx" ON "electricity_bills"("customer_id", "status", "due_date");
CREATE INDEX "electricity_bills_billing_year_billing_month_idx" ON "electricity_bills"("billing_year", "billing_month");
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payments" ADD COLUMN "bill_id" UUID;
CREATE INDEX "payments_bill_id_idx" ON "payments"("bill_id");
CREATE UNIQUE INDEX "payments_one_pending_bill_idx" ON "payments"("bill_id") WHERE "bill_id" IS NOT NULL AND "status" = 'PENDING';
ALTER TABLE "payments" ADD CONSTRAINT "payments_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "electricity_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;
