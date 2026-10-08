import { ExecutionStatus, ExecutionType, Prisma, PrismaClient, ReconciliationStatus } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { demoPath } from "../utils/demo-data.js";
import { transformAndValidateRecord, type Mapping, type Transformation } from "./deterministic-engine.js";
import { WorkflowError } from "./approval.js";
import { getSourceRecordId } from "./source-record.js";

const prisma = new PrismaClient();
type Field = { name: string; type: string; required?: boolean; nullable?: boolean; enum?: string[] };
const readRecords = async () => JSON.parse(await readFile(await demoPath("source-records.json"), "utf8")) as Array<Record<string, unknown>>;

export async function reconcileMigration(migrationId: string, executionId: string) {
  const execution = await prisma.migrationExecution.findUnique({ where: { id: executionId }, include: { migration: true, plan: true } });
  if (!execution || execution.migrationId !== migrationId) throw new WorkflowError(404, "Execution not found.");
  if (execution.type !== ExecutionType.MIGRATION) throw new WorkflowError(409, "Only migration executions can be reconciled.");
  if (execution.status !== ExecutionStatus.COMPLETED) throw new WorkflowError(409, `Only COMPLETED executions can be reconciled; current status is ${execution.status}.`);
  const existing = await prisma.reconciliation.findUnique({ where: { executionId } });
  if (existing) return existing;
  try {
    const targetSchema = await prisma.migrationSchema.findFirstOrThrow({ where: { migrationId, type: "TARGET" }, orderBy: { version: "desc" } });
    const records = (execution.migration.sourceRecords ? execution.migration.sourceRecords as Array<Record<string, unknown>> : await readRecords()).slice(0, execution.migration.sampleLimit);
    const mappings = execution.plan.mapping as Mapping[];
    const transformations = execution.plan.transformations as unknown as Transformation[];
    const targetFields = (targetSchema.definition as { fields: Field[] }).fields;
    // A retry creates a new execution but reuses the existing migration
    // records for already-migrated source rows. Reconcile the migration as a
    // whole so retries remain idempotent and do not appear incomplete.
    const migrationRecords = await prisma.migrationRecord.findMany({ where: { migrationId }, orderBy: { sourceRecordId: "asc" } });
    const expected = records.map((source, index) => ({ source, sourceRecordId: getSourceRecordId(source, index), result: transformAndValidateRecord(source, mappings, transformations, targetFields) })).filter((item) => item.result.errors.length === 0);
    const recordBySource = new Map(migrationRecords.map((record) => [record.sourceRecordId, record]));
    const missing: unknown[] = []; const mismatched: unknown[] = []; let matchedCount = 0;
    for (const item of expected) {
      const relation = recordBySource.get(item.sourceRecordId);
      if (!relation) { missing.push({ sourceRecordId: item.sourceRecordId, reason: "No MigrationRecord exists." }); continue; }
      const target = execution.migration.sourceRecords ? relation.targetData : await prisma.customer.findUnique({ where: { id: Number(relation.targetRecordId) } });
      if (!target) { missing.push({ sourceRecordId: item.sourceRecordId, targetRecordId: relation.targetRecordId, reason: "Associated target record does not exist." }); continue; }
      const mismatches = Object.entries(item.result.output).flatMap(([field, expectedValue]) => {
        const actualValue = (target as Record<string, unknown>)[field];
        const normalizedActual = actualValue instanceof Date ? actualValue.toISOString() : actualValue;
        return String(expectedValue) === String(normalizedActual) ? [] : [{ field, expected: expectedValue, actual: normalizedActual }];
      });
      if (mismatches.length > 0) mismatched.push({ sourceRecordId: item.sourceRecordId, targetRecordId: relation.targetRecordId, mismatches }); else matchedCount++;
    }
    const expectedIds = new Set(expected.map((item) => item.sourceRecordId));
    const extra = migrationRecords.filter((record) => !expectedIds.has(record.sourceRecordId)).map((record) => ({ targetRecordId: record.targetRecordId, reason: "Target relationship has no expected source record." }));
    const details = { missing, extra, mismatched };
    const result = await prisma.$transaction(async (transaction) => {
      const reconciliation = await transaction.reconciliation.create({ data: { migrationId, executionId, status: missing.length || extra.length || mismatched.length ? ReconciliationStatus.MISMATCHED : ReconciliationStatus.MATCHED, sourceCount: records.length, targetCount: migrationRecords.length, matchedCount, missingCount: missing.length, extraCount: extra.length, mismatchCount: mismatched.length, details: details as Prisma.InputJsonValue } });
      await transaction.auditEvent.create({ data: { migrationId, executionId, eventType: "RECONCILIATION_COMPLETED", metadata: { executionId, sourceCount: records.length, targetCount: migrationRecords.length, matchedCount, missingCount: missing.length, extraCount: extra.length, mismatchCount: mismatched.length } } });
      return reconciliation;
    });
    return result;
  } catch (error) {
    await prisma.reconciliation.create({ data: { migrationId, executionId, status: ReconciliationStatus.FAILED, sourceCount: 0, targetCount: 0, matchedCount: 0, missingCount: 0, extraCount: 0, mismatchCount: 0, details: { error: error instanceof Error ? error.message : "Unknown reconciliation error" } } }).catch(() => undefined);
    await prisma.auditEvent.create({ data: { migrationId, executionId, eventType: "RECONCILIATION_FAILED", metadata: { executionId, message: error instanceof Error ? error.message : "Unknown reconciliation error" } } }).catch(() => undefined);
    throw error;
  }
}
