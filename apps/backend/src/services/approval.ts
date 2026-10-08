import { MigrationStatus, PlanStatus, Prisma, PrismaClient } from "@prisma/client";
import { normalizeEnumQuarantineMappings } from "./analysis.js";
import { enumMappingErrors } from "../ai/tools/validate-mapping.js";

const prisma = new PrismaClient();
export class WorkflowError extends Error { constructor(public readonly status: number, message: string) { super(message); } }

async function getPlan(migrationId: string, planId: string) {
  const plan = await prisma.migrationPlan.findUnique({ where: { id: planId } });
  if (!plan) throw new WorkflowError(404, "Migration plan not found.");
  if (plan.migrationId !== migrationId) throw new WorkflowError(404, "Migration plan does not belong to this migration.");
  return plan;
}

export async function submitPlan(migrationId: string, planId: string) {
  const plan = await getPlan(migrationId, planId);
  if (plan.status !== PlanStatus.DRAFT) throw new WorkflowError(409, `Only DRAFT plans can be submitted; current status is ${plan.status}.`);
  const schemas = await prisma.migrationSchema.findMany({ where: { migrationId } });
  const sourceSchema = schemas.find((schema) => schema.type === "SOURCE");
  const targetSchema = schemas.find((schema) => schema.type === "TARGET");
  const normalizedTransformations = normalizeEnumQuarantineMappings(plan.transformations as Array<{ sourceField: string; targetField: string; type: string; config?: Record<string, string> }>, sourceSchema?.definition as { fields?: Array<{ name: string; enum?: string[] }> }, targetSchema?.definition as { fields?: Array<{ name: string; enum?: string[] }> });
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.migrationPlan.update({ where: { id: planId }, data: { status: PlanStatus.PENDING_APPROVAL, transformations: normalizedTransformations as Prisma.InputJsonValue } });
    await transaction.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.PENDING_APPROVAL } });
    await transaction.auditEvent.create({ data: { migrationId, eventType: "PLAN_UPDATED", metadata: { action: "SUBMITTED_FOR_APPROVAL", planId, planVersion: plan.version } } });
    return updated;
  });
}

export async function approvePlan(migrationId: string, planId: string) {
  const plan = await getPlan(migrationId, planId);
  if (plan.status !== PlanStatus.PENDING_APPROVAL) throw new WorkflowError(409, `Only PENDING_APPROVAL plans can be approved; current status is ${plan.status}.`);
  const validation = plan.validation as { isValid?: boolean; errors?: unknown[] };
  if (validation.isValid === false || (validation.errors?.length ?? 0) > 0) throw new WorkflowError(422, "Plan has deterministic validation errors and cannot be approved.");
  const schemas = await prisma.migrationSchema.findMany({ where: { migrationId } });
  const sourceSchema = schemas.find((schema) => schema.type === "SOURCE");
  const targetSchema = schemas.find((schema) => schema.type === "TARGET");
  const enumErrors = enumMappingErrors(sourceSchema?.definition as { fields?: Array<{ name: string; enum?: string[] }> }, targetSchema?.definition as { fields?: Array<{ name: string; enum?: string[] }> }, plan.transformations as Array<{ sourceField: string; targetField: string; type: string; config?: Record<string, string> }>);
  if (enumErrors.length > 0) throw new WorkflowError(422, `Enum mapping is incomplete: ${enumErrors.join(" ")}`);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.migrationPlan.update({ where: { id: planId }, data: { status: PlanStatus.APPROVED, approvedAt: new Date() } });
    await transaction.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.READY_TO_EXECUTE } });
    await transaction.auditEvent.create({ data: { migrationId, eventType: "PLAN_APPROVED", metadata: { planId, planVersion: plan.version } } });
    return updated;
  });
}

export async function rejectPlan(migrationId: string, planId: string, reason?: string) {
  const plan = await getPlan(migrationId, planId);
  if (plan.status !== PlanStatus.PENDING_APPROVAL) throw new WorkflowError(409, `Only PENDING_APPROVAL plans can be rejected; current status is ${plan.status}.`);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.migrationPlan.update({ where: { id: planId }, data: { status: PlanStatus.REJECTED } });
    await transaction.migration.update({ where: { id: migrationId }, data: { status: MigrationStatus.PLAN_DRAFT } });
    await transaction.auditEvent.create({ data: { migrationId, eventType: "PLAN_REJECTED", metadata: { planId, planVersion: plan.version, reason: reason ?? null } } });
    return updated;
  });
}
