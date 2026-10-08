import { ExecutionStatus, ExecutionType, MigrationStatus, PlanStatus, Prisma, PrismaClient, DryRunRecordStatus } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { demoPath } from "../utils/demo-data.js";
import { transformAndValidateRecord, type Mapping, type Transformation } from "./deterministic-engine.js";
import { WorkflowError } from "./approval.js";
import { getSourceRecordId } from "./source-record.js";

const prisma = new PrismaClient();
type Field = { name: string; type: string; required?: boolean; nullable?: boolean; enum?: string[] };
const json = async (file: string) => JSON.parse(await readFile(await demoPath(file), "utf8")) as unknown;

export async function runDryRun(migrationId: string, planId: string) {
  const plan = await prisma.migrationPlan.findUnique({ where: { id: planId }, include: { migration: true } });
  if (!plan) throw new WorkflowError(404, "Migration plan not found.");
  if (plan.migrationId !== migrationId) throw new WorkflowError(404, "Migration plan does not belong to this migration.");
  if (plan.status !== PlanStatus.APPROVED) throw new WorkflowError(409, `Dry run requires an APPROVED plan; current status is ${plan.status}.`);
  const targetSchema = await prisma.migrationSchema.findFirstOrThrow({ where: { migrationId, type: "TARGET" }, orderBy: { version: "desc" } });
  const records = (plan.migration.sourceRecords ? plan.migration.sourceRecords : await json("source-records.json")) as Array<Record<string, unknown>>;
  const bounded = records.slice(0, plan.migration.sampleLimit);
  const execution = await prisma.migrationExecution.create({ data: { migrationId, planId, type: ExecutionType.DRY_RUN, status: ExecutionStatus.RUNNING, sourceCount: bounded.length, startedAt: new Date() } });
  await prisma.auditEvent.create({ data: { migrationId, executionId: execution.id, eventType: "DRY_RUN_STARTED", metadata: { executionId: execution.id, planId, sourceCount: bounded.length } } });
  try {
    const mappings = plan.mapping as Mapping[];
    const transformations = plan.transformations as unknown as Transformation[];
    const targetFields = (targetSchema.definition as { fields: Field[] }).fields;
    let transformedCount = 0; let acceptedCount = 0; let rejectedCount = 0;
    for (const [index, source] of bounded.entries()) {
      const sourceRecordId = getSourceRecordId(source, index);
      const result = transformAndValidateRecord(source, mappings, transformations, targetFields);
      transformedCount++;
      if (result.errors.length === 0) { acceptedCount++; await prisma.dryRunRecord.create({ data: { executionId: execution.id, sourceRecordId, transformedData: result.output as Prisma.InputJsonValue, status: DryRunRecordStatus.ACCEPTED } }); }
      else { rejectedCount++; await prisma.dryRunRecord.create({ data: { executionId: execution.id, sourceRecordId, transformedData: result.output as Prisma.InputJsonValue, status: DryRunRecordStatus.REJECTED } }); await prisma.quarantineRecord.create({ data: { executionId: execution.id, sourceRecordId, sourceData: source as Prisma.InputJsonValue, errors: result.errors as unknown as Prisma.InputJsonValue } }); }
    }
    const completed = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.migrationExecution.update({ where: { id: execution.id }, data: { status: ExecutionStatus.COMPLETED, transformedCount, acceptedCount, rejectedCount, migratedCount: 0, completedAt: new Date() } });
      await transaction.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.READY_TO_EXECUTE } });
      await transaction.auditEvent.create({ data: { migrationId, executionId: execution.id, eventType: "DRY_RUN_COMPLETED", metadata: { executionId: execution.id, planId, sourceCount: bounded.length, acceptedCount, rejectedCount } } });
      return updated;
    });
    return completed;
  } catch (error) {
    await prisma.$transaction([
      prisma.migrationExecution.update({ where: { id: execution.id }, data: { status: ExecutionStatus.FAILED, completedAt: new Date() } }),
      prisma.auditEvent.create({ data: { migrationId, executionId: execution.id, eventType: "MIGRATION_FAILED", metadata: { executionId: execution.id, planId, message: error instanceof Error ? error.message : "Unknown dry-run error" } } }),
    ]);
    throw error;
  }
}
