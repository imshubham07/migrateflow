import { ExecutionStatus, ExecutionType, MigrationStatus, Prisma, PrismaClient, RecordStatus, RollbackStatus } from "@prisma/client";
import { WorkflowError } from "./approval.js";

const prisma = new PrismaClient();

export async function rollbackMigration(migrationId: string, executionId: string) {
  const execution = await prisma.migrationExecution.findUnique({ where: { id: executionId }, include: { records: true, migration: true } });
  if (!execution || execution.migrationId !== migrationId) throw new WorkflowError(404, "Execution not found.");
  if (execution.type !== ExecutionType.MIGRATION || execution.status !== ExecutionStatus.COMPLETED) throw new WorkflowError(409, "Only completed migration executions can be rolled back.");
  if (execution.records.length === 0) throw new WorkflowError(409, "Execution has no migrated records to roll back.");
  if (execution.records.every((record) => record.status === RecordStatus.ROLLED_BACK)) throw new WorkflowError(409, "Execution has already been rolled back.");
  const existing = await prisma.rollback.findUnique({ where: { executionId } });
  if (existing) throw new WorkflowError(409, "Execution has already received a rollback result.");
  const records = execution.records.filter((record) => record.status === RecordStatus.MIGRATED);
  await prisma.auditEvent.create({ data: { migrationId, executionId, eventType: "ROLLBACK_STARTED", metadata: { executionId, targetRecordsFound: records.length } } });
  let deleted = 0; let missing = 0; let failed = 0;
  const details: unknown[] = [];
  try {
    for (const record of records) {
      try {
        const result = await prisma.$transaction(async (transaction) => {
          if (execution.migration?.sourceRecords) {
            await transaction.migrationRecord.update({ where: { id: record.id }, data: { status: RecordStatus.ROLLED_BACK } });
            return "deleted" as const;
          }
          const target = await transaction.customer.findUnique({ where: { id: Number(record.targetRecordId) }, select: { id: true } });
          if (!target) {
            await transaction.migrationRecord.update({ where: { id: record.id }, data: { status: RecordStatus.ROLLED_BACK } });
            return "missing" as const;
          }
          await transaction.customer.delete({ where: { id: target.id } });
          await transaction.migrationRecord.update({ where: { id: record.id }, data: { status: RecordStatus.ROLLED_BACK } });
          return "deleted" as const;
        });
        if (result === "missing") { missing++; details.push({ targetRecordId: record.targetRecordId, status: "ALREADY_MISSING", message: "Target record was not found." }); }
        else deleted++;
      } catch (error) { failed++; details.push({ targetRecordId: record.targetRecordId, status: "FAILED", message: error instanceof Error ? error.message : "Target deletion failed." }); }
    }
    const status = failed === 0 ? RollbackStatus.COMPLETED : RollbackStatus.FAILED;
    const result = await prisma.$transaction(async (transaction) => {
      const rollback = await transaction.rollback.create({ data: { migrationId, executionId, status, targetRecordsFound: records.length, targetRecordsDeleted: deleted, alreadyMissing: missing, failed, details: details as Prisma.InputJsonValue } });
      await transaction.migration.update({ where: { id: migrationId }, data: { status: failed === 0 ? MigrationStatus.ROLLED_BACK : MigrationStatus.FAILED } });
      await transaction.auditEvent.create({ data: { migrationId, executionId, eventType: failed === 0 ? "ROLLBACK_COMPLETED" : "ROLLBACK_FAILED", metadata: { executionId, targetRecordsFound: records.length, targetRecordsDeleted: deleted, alreadyMissing: missing, failed } } });
      return rollback;
    });
    return { executionId, status, targetRecordsFound: records.length, targetRecordsDeleted: deleted, alreadyMissing: missing, failed, details, rollbackId: result.id };
  } catch (error) {
    await prisma.auditEvent.create({ data: { migrationId, executionId, eventType: "ROLLBACK_FAILED", metadata: { executionId, targetRecordsFound: records.length, targetRecordsDeleted: deleted, alreadyMissing: missing, failed, message: error instanceof Error ? error.message : "Unknown rollback error" } } }).catch(() => undefined);
    throw error;
  }
}
