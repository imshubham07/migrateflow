import { ExecutionStatus, ExecutionType, MigrationStatus, PlanStatus, Prisma, PrismaClient, RecordStatus } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { demoPath } from "../utils/demo-data.js";
import { transformAndValidateRecord, type Mapping, type Transformation } from "./deterministic-engine.js";
import { WorkflowError } from "./approval.js";
import { getSourceRecordId } from "./source-record.js";

const prisma = new PrismaClient();
type Field = { name: string; type: string; required?: boolean; nullable?: boolean; enum?: string[] };
const readDemoRecords = async () => JSON.parse(await readFile(await demoPath("source-records.json"), "utf8")) as Array<Record<string, unknown>>;

export function migrationRecordAction(status?: RecordStatus): "SKIP" | "REUSE" | "CREATE" {
  if (status === RecordStatus.MIGRATED) return "SKIP";
  if (status === RecordStatus.ROLLED_BACK) return "REUSE";
  return "CREATE";
}

async function approvedPlan(migrationId: string, planId: string) {
  const plan = await prisma.migrationPlan.findUnique({ where: { id: planId }, include: { migration: true } });
  if (!plan) throw new WorkflowError(404, "Migration plan not found.");
  if (plan.migrationId !== migrationId) throw new WorkflowError(404, "Migration plan does not belong to this migration.");
  if (plan.status !== PlanStatus.APPROVED) throw new WorkflowError(409, `Execution requires an APPROVED plan; current status is ${plan.status}.`);
  return plan;
}

export async function executeMigration(migrationId: string, planId: string, retriedExecutionId?: string) {
  const plan = await approvedPlan(migrationId, planId);
  const targetSchema = await prisma.migrationSchema.findFirstOrThrow({ where: { migrationId, type: "TARGET" }, orderBy: { version: "desc" } });
  const sources = (plan.migration.sourceRecords ? plan.migration.sourceRecords as Array<Record<string, unknown>> : await readDemoRecords()).slice(0, plan.migration.sampleLimit);
  const execution = await prisma.migrationExecution.create({ data: { migrationId, planId, type: ExecutionType.MIGRATION, status: ExecutionStatus.RUNNING, sourceCount: sources.length, startedAt: new Date() } });
  await prisma.auditEvent.create({ data: { migrationId, executionId: execution.id, eventType: retriedExecutionId ? "MIGRATION_RETRIED" : "MIGRATION_STARTED", metadata: { executionId: execution.id, planId, previousExecutionId: retriedExecutionId ?? null, sourceCount: sources.length } } });
  let transformedCount = 0; let acceptedCount = 0; let rejectedCount = 0; let migratedCount = 0;
  try {
    const mappings = plan.mapping as Mapping[];
    const transformations = plan.transformations as unknown as Transformation[];
    const targetFields = (targetSchema.definition as { fields: Field[] }).fields;
    for (const [index, source] of sources.entries()) {
      const sourceRecordId = getSourceRecordId(source, index);
      const result = transformAndValidateRecord(source, mappings, transformations, targetFields);
      transformedCount++;
      if (result.errors.length > 0) {
        rejectedCount++;
        await prisma.quarantineRecord.create({ data: { executionId: execution.id, sourceRecordId, sourceData: source as Prisma.InputJsonValue, errors: result.errors as unknown as Prisma.InputJsonValue } });
        continue;
      }
      acceptedCount++;
      const target = result.output as { id: number; name: string; email: string; phone?: string | null; status: string; createdAt: string };
      const migrated = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.migrationRecord.findUnique({ where: { migrationId_sourceRecordId: { migrationId, sourceRecordId } } });
        if (migrationRecordAction(existing?.status) === "SKIP") return false;
        const targetData = result.output as Prisma.InputJsonValue;
        if (plan.migration.sourceRecords) {
          if (existing && migrationRecordAction(existing.status) === "REUSE") await transaction.migrationRecord.update({ where: { id: existing.id }, data: { executionId: execution.id, targetRecordId: sourceRecordId, targetData, status: RecordStatus.MIGRATED } });
          else await transaction.migrationRecord.create({ data: { migrationId, executionId: execution.id, sourceRecordId, targetRecordId: sourceRecordId, targetData, status: RecordStatus.MIGRATED } });
        } else {
          const targetExists = await transaction.customer.findUnique({ where: { id: target.id }, select: { id: true } });
          if (targetExists) throw new Error(`Target customer ID ${target.id} already exists without a matching migration record.`);
          await transaction.customer.create({ data: { id: target.id, name: target.name, email: target.email, phone: target.phone ?? null, status: target.status, createdAt: new Date(target.createdAt) } });
          if (existing && migrationRecordAction(existing.status) === "REUSE") await transaction.migrationRecord.update({ where: { id: existing.id }, data: { executionId: execution.id, targetRecordId: String(target.id), status: RecordStatus.MIGRATED } });
          else await transaction.migrationRecord.create({ data: { migrationId, executionId: execution.id, sourceRecordId, targetRecordId: String(target.id), status: RecordStatus.MIGRATED } });
        }
        return true;
      });
      if (migrated) migratedCount++;
    }
    if (sources.length > 0 && acceptedCount === 0) {
      throw new Error("Migration produced no eligible records; all source records were quarantined.");
    }
    const completed = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.migrationExecution.update({ where: { id: execution.id }, data: { status: ExecutionStatus.COMPLETED, transformedCount, acceptedCount, rejectedCount, migratedCount, completedAt: new Date() } });
      await transaction.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.COMPLETED } });
      await transaction.auditEvent.create({ data: { migrationId, executionId: execution.id, eventType: "MIGRATION_COMPLETED", metadata: { executionId: execution.id, planId, sourceCount: sources.length, acceptedCount, rejectedCount, migratedCount } } });
      return updated;
    });
    return completed;
  } catch (error) {
    await prisma.$transaction([
      prisma.migrationExecution.update({ where: { id: execution.id }, data: { status: ExecutionStatus.FAILED, transformedCount, acceptedCount, rejectedCount, migratedCount, completedAt: new Date() } }),
      prisma.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.FAILED } }),
      prisma.auditEvent.create({ data: { migrationId, executionId: execution.id, eventType: "MIGRATION_FAILED", metadata: { executionId: execution.id, planId, message: error instanceof Error ? error.message : "Unknown migration error" } } }),
    ]);
    throw error;
  }
}

export async function retryMigration(migrationId: string, executionId: string) {
  const previous = await prisma.migrationExecution.findUnique({ where: { id: executionId } });
  if (!previous || previous.migrationId !== migrationId) throw new WorkflowError(404, "Execution not found.");
  if (previous.type !== ExecutionType.MIGRATION) throw new WorkflowError(409, "Only migration executions can be retried.");
  return executeMigration(migrationId, previous.planId, previous.id);
}
