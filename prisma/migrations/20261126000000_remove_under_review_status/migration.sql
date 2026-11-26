-- AlterEnum
BEGIN;
CREATE TYPE "OutageStatus_new" AS ENUM ('REPORTED', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');
ALTER TABLE "public"."outage_reports" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "outage_reports" ALTER COLUMN "status" TYPE "OutageStatus_new" USING ("status"::text::"OutageStatus_new");
ALTER TYPE "OutageStatus" RENAME TO "OutageStatus_old";
ALTER TYPE "OutageStatus_new" RENAME TO "OutageStatus";
DROP TYPE "public"."OutageStatus_old";
ALTER TABLE "outage_reports" ALTER COLUMN "status" SET DEFAULT 'REPORTED';
COMMIT;
