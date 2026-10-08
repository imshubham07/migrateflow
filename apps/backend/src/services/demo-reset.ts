import { MigrationStatus, PlanStatus, PrismaClient } from "@prisma/client";
import { WorkflowError } from "./approval.js";

const prisma = new PrismaClient();

/** Reset only the known seeded demo migration and its generated target rows. */
export async function resetDemoMigration(migrationId: string) {
  const migration = await prisma.migration.findUnique({ where: { id: migrationId }, select: { id: true, sourceName: true } });
  if (!migration) throw new WorkflowError(404, "Migration not found.");
  if (migration.sourceName !== "legacy_customers") throw new WorkflowError(403, "Reset is available only for the seeded demo migration.");

  return prisma.$transaction(async (transaction) => {
    const executions = await transaction.migrationExecution.findMany({ where: { migrationId }, select: { id: true } });
    const executionIds = executions.map((execution) => execution.id);
    const records = await transaction.migrationRecord.findMany({ where: { migrationId }, select: { targetRecordId: true } });

    // Delete only target customers recorded as created by this migration.
    const targetIds = records.map((record) => Number(record.targetRecordId)).filter((id) => Number.isInteger(id));
    if (targetIds.length > 0) await transaction.customer.deleteMany({ where: { id: { in: targetIds } } });
    if (executionIds.length > 0) {
      await transaction.rollback.deleteMany({ where: { executionId: { in: executionIds } } });
      await transaction.reconciliation.deleteMany({ where: { executionId: { in: executionIds } } });
      await transaction.dryRunRecord.deleteMany({ where: { executionId: { in: executionIds } } });
      await transaction.quarantineRecord.deleteMany({ where: { executionId: { in: executionIds } } });
      await transaction.auditEvent.deleteMany({ where: { executionId: { in: executionIds } } });
      await transaction.migrationRecord.deleteMany({ where: { migrationId } });
      await transaction.migrationExecution.deleteMany({ where: { id: { in: executionIds } } });
    }
    await transaction.migrationPlan.updateMany({ where: { migrationId, status: { in: [PlanStatus.PENDING_APPROVAL, PlanStatus.APPROVED] } }, data: { status: PlanStatus.DRAFT, approvedAt: null } });
    await transaction.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.PLAN_DRAFT } });
    await transaction.auditEvent.create({ data: { migrationId, eventType: "DEMO_RESET", metadata: { executionCount: executionIds.length, targetRecordCount: records.length } } });
    return { migrationId, executionsCleared: executionIds.length, targetRecordsCleared: records.length, status: MigrationStatus.PLAN_DRAFT };
  }, { timeout: 20000, maxWait: 10000 });
}
