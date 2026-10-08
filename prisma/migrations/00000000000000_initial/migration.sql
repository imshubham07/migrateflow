-- Initial MigrateFlow schema. Generated from prisma/schema.prisma.
CREATE SCHEMA IF NOT EXISTS "public";
CREATE TYPE "MigrationStatus" AS ENUM ('SETUP','ANALYZING','PLAN_DRAFT','PENDING_APPROVAL','APPROVED','DRY_RUN','READY_TO_EXECUTE','EXECUTING','COMPLETED','FAILED','ROLLED_BACK');
CREATE TYPE "SchemaType" AS ENUM ('SOURCE','TARGET');
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','SUPERSEDED');
CREATE TYPE "ExecutionType" AS ENUM ('DRY_RUN','MIGRATION');
CREATE TYPE "ExecutionStatus" AS ENUM ('PENDING','RUNNING','COMPLETED','FAILED','ROLLED_BACK');
CREATE TYPE "RecordStatus" AS ENUM ('MIGRATED','ROLLED_BACK');
CREATE TYPE "ReconciliationStatus" AS ENUM ('MATCHED','MISMATCHED','FAILED');
CREATE TYPE "RollbackStatus" AS ENUM ('COMPLETED','FAILED');
CREATE TYPE "DryRunRecordStatus" AS ENUM ('ACCEPTED','REJECTED');

CREATE TABLE "Migration" ("id" TEXT NOT NULL,"name" TEXT NOT NULL,"sourceName" TEXT NOT NULL,"targetName" TEXT NOT NULL,"sampleLimit" INTEGER NOT NULL,"status" "MigrationStatus" NOT NULL DEFAULT 'SETUP',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Migration_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Customer" ("id" INTEGER NOT NULL,"name" TEXT NOT NULL,"email" TEXT NOT NULL,"phone" TEXT,"status" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "Customer_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MigrationSchema" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"type" "SchemaType" NOT NULL,"version" INTEGER NOT NULL,"definition" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "MigrationSchema_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MigrationPlan" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"version" INTEGER NOT NULL,"status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',"mapping" JSONB NOT NULL,"transformations" JSONB NOT NULL,"risks" JSONB NOT NULL,"questions" JSONB NOT NULL,"validation" JSONB NOT NULL,"planSummary" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"approvedAt" TIMESTAMP(3),CONSTRAINT "MigrationPlan_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MigrationExecution" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"planId" TEXT NOT NULL,"type" "ExecutionType" NOT NULL,"status" "ExecutionStatus" NOT NULL DEFAULT 'PENDING',"sourceCount" INTEGER NOT NULL DEFAULT 0,"transformedCount" INTEGER NOT NULL DEFAULT 0,"acceptedCount" INTEGER NOT NULL DEFAULT 0,"rejectedCount" INTEGER NOT NULL DEFAULT 0,"migratedCount" INTEGER NOT NULL DEFAULT 0,"startedAt" TIMESTAMP(3),"completedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "MigrationExecution_pkey" PRIMARY KEY ("id"));
CREATE TABLE "DryRunRecord" ("id" TEXT NOT NULL,"executionId" TEXT NOT NULL,"sourceRecordId" TEXT NOT NULL,"transformedData" JSONB NOT NULL,"status" "DryRunRecordStatus" NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "DryRunRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "MigrationRecord" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"executionId" TEXT NOT NULL,"sourceRecordId" TEXT NOT NULL,"targetRecordId" TEXT NOT NULL,"status" "RecordStatus" NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "MigrationRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "QuarantineRecord" ("id" TEXT NOT NULL,"executionId" TEXT NOT NULL,"sourceRecordId" TEXT NOT NULL,"sourceData" JSONB NOT NULL,"errors" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "QuarantineRecord_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AuditEvent" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"executionId" TEXT,"eventType" TEXT NOT NULL,"metadata" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Reconciliation" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"executionId" TEXT NOT NULL,"status" "ReconciliationStatus" NOT NULL,"sourceCount" INTEGER NOT NULL,"targetCount" INTEGER NOT NULL,"matchedCount" INTEGER NOT NULL,"missingCount" INTEGER NOT NULL,"extraCount" INTEGER NOT NULL,"mismatchCount" INTEGER NOT NULL,"details" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Reconciliation_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Rollback" ("id" TEXT NOT NULL,"migrationId" TEXT NOT NULL,"executionId" TEXT NOT NULL,"status" "RollbackStatus" NOT NULL,"targetRecordsFound" INTEGER NOT NULL,"targetRecordsDeleted" INTEGER NOT NULL,"alreadyMissing" INTEGER NOT NULL,"failed" INTEGER NOT NULL,"details" JSONB NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,CONSTRAINT "Rollback_pkey" PRIMARY KEY ("id"));

CREATE INDEX "Migration_status_idx" ON "Migration"("status"); CREATE INDEX "Migration_createdAt_idx" ON "Migration"("createdAt");
CREATE INDEX "MigrationSchema_migrationId_idx" ON "MigrationSchema"("migrationId"); CREATE UNIQUE INDEX "MigrationSchema_migrationId_type_version_key" ON "MigrationSchema"("migrationId","type","version");
CREATE INDEX "MigrationPlan_migrationId_idx" ON "MigrationPlan"("migrationId"); CREATE INDEX "MigrationPlan_status_idx" ON "MigrationPlan"("status"); CREATE UNIQUE INDEX "MigrationPlan_migrationId_version_key" ON "MigrationPlan"("migrationId","version");
CREATE INDEX "MigrationExecution_migrationId_idx" ON "MigrationExecution"("migrationId"); CREATE INDEX "MigrationExecution_planId_idx" ON "MigrationExecution"("planId"); CREATE INDEX "MigrationExecution_status_idx" ON "MigrationExecution"("status"); CREATE INDEX "MigrationExecution_createdAt_idx" ON "MigrationExecution"("createdAt");
CREATE INDEX "DryRunRecord_executionId_idx" ON "DryRunRecord"("executionId"); CREATE INDEX "DryRunRecord_status_idx" ON "DryRunRecord"("status"); CREATE UNIQUE INDEX "DryRunRecord_executionId_sourceRecordId_key" ON "DryRunRecord"("executionId","sourceRecordId");
CREATE INDEX "MigrationRecord_executionId_idx" ON "MigrationRecord"("executionId"); CREATE INDEX "MigrationRecord_status_idx" ON "MigrationRecord"("status"); CREATE UNIQUE INDEX "MigrationRecord_migrationId_sourceRecordId_key" ON "MigrationRecord"("migrationId","sourceRecordId");
CREATE INDEX "QuarantineRecord_executionId_idx" ON "QuarantineRecord"("executionId"); CREATE INDEX "QuarantineRecord_createdAt_idx" ON "QuarantineRecord"("createdAt");
CREATE INDEX "AuditEvent_migrationId_idx" ON "AuditEvent"("migrationId"); CREATE INDEX "AuditEvent_executionId_idx" ON "AuditEvent"("executionId"); CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType"); CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE UNIQUE INDEX "Reconciliation_executionId_key" ON "Reconciliation"("executionId"); CREATE INDEX "Reconciliation_migrationId_idx" ON "Reconciliation"("migrationId"); CREATE INDEX "Reconciliation_status_idx" ON "Reconciliation"("status");
CREATE UNIQUE INDEX "Rollback_executionId_key" ON "Rollback"("executionId"); CREATE INDEX "Rollback_migrationId_idx" ON "Rollback"("migrationId"); CREATE INDEX "Rollback_status_idx" ON "Rollback"("status");

ALTER TABLE "MigrationSchema" ADD CONSTRAINT "MigrationSchema_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationPlan" ADD CONSTRAINT "MigrationPlan_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationExecution" ADD CONSTRAINT "MigrationExecution_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationExecution" ADD CONSTRAINT "MigrationExecution_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MigrationPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DryRunRecord" ADD CONSTRAINT "DryRunRecord_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MigrationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationRecord" ADD CONSTRAINT "MigrationRecord_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MigrationRecord" ADD CONSTRAINT "MigrationRecord_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MigrationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuarantineRecord" ADD CONSTRAINT "QuarantineRecord_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MigrationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MigrationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reconciliation" ADD CONSTRAINT "Reconciliation_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MigrationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rollback" ADD CONSTRAINT "Rollback_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Rollback" ADD CONSTRAINT "Rollback_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "MigrationExecution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
