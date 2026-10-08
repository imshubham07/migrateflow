ALTER TABLE "Migration" ADD COLUMN "sourceRecords" JSONB;
ALTER TABLE "Migration" ADD COLUMN "sourceFormat" TEXT;
ALTER TABLE "MigrationRecord" ADD COLUMN "targetData" JSONB;
