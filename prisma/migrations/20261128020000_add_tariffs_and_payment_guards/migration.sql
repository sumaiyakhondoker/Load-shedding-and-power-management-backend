BEGIN;

CREATE TABLE "electricity_tariffs" (
    "id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "rate_per_unit" DECIMAL(12,4) NOT NULL,
    "currency" VARCHAR(10) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(0) NOT NULL,
    CONSTRAINT "electricity_tariffs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "electricity_tariffs_rate_check" CHECK ("rate_per_unit" > 0),
    CONSTRAINT "electricity_tariffs_currency_check" CHECK ("currency" IN ('USD', 'BDT'))
);

CREATE UNIQUE INDEX "electricity_tariffs_name_key" ON "electricity_tariffs"("name");

ALTER TABLE "electricity_bills" ADD COLUMN "tariff_id" UUID;
ALTER TABLE "electricity_bills" ADD CONSTRAINT "electricity_bills_tariff_id_fkey"
    FOREIGN KEY ("tariff_id") REFERENCES "electricity_tariffs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "electricity_bills_tariff_id_idx" ON "electricity_bills"("tariff_id");

CREATE UNIQUE INDEX "payments_one_paid_bill_idx"
    ON "payments"("bill_id") WHERE "bill_id" IS NOT NULL AND "status" = 'PAID';
CREATE INDEX "payments_user_id_created_at_id_idx" ON "payments"("user_id", "created_at", "id");
CREATE INDEX "payments_created_at_id_idx" ON "payments"("created_at", "id");

COMMIT;
