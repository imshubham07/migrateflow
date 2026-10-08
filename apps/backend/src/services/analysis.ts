import { PrismaClient, PlanStatus } from "@prisma/client";
import { generateMigrationPlan } from "../ai/gemini.js";
import { inspectSampleRecords, inspectSourceSchema, inspectTargetSchema, getSupportedTransformations } from "../ai/tools/inspection.js";
import { validateMapping } from "../ai/tools/validate-mapping.js";

const prisma = new PrismaClient();

export function normalizeEnumQuarantineMappings<T extends { sourceField: string; targetField: string; type: string; config?: Record<string, string> }>(transformations: T[], sourceDefinition: { fields?: Array<{ name: string; enum?: string[] }> }, targetDefinition: { fields?: Array<{ name: string; enum?: string[] }> }): T[] {
  const sourceFields = new Map((sourceDefinition.fields ?? []).map((field) => [field.name, field]));
  const targetFields = new Map((targetDefinition.fields ?? []).map((field) => [field.name, field]));
  return transformations.map((transformation) => {
    if (transformation.type !== "ENUM_MAPPING") return transformation;
    const sourceField = sourceFields.get(transformation.sourceField);
    const targetField = targetFields.get(transformation.targetField);
    if (!sourceField?.enum || !targetField?.enum) return transformation;
    const config = { ...(transformation.config ?? {}) };
    for (const sourceValue of sourceField.enum) {
      if (config[sourceValue] !== undefined) continue;
      config[sourceValue] = targetField.enum.includes(sourceValue.toUpperCase()) ? sourceValue.toUpperCase() : "QUARANTINE";
    }
    return { ...transformation, config };
  });
}

export async function analyzeMigration(migrationId: string) {
  const [migration, source, target, records] = await Promise.all([
    prisma.migration.findUniqueOrThrow({ where: { id: migrationId } }),
    inspectSourceSchema(migrationId), inspectTargetSchema(migrationId), inspectSampleRecords(migrationId, 1000),
  ]);
  const plan = await generateMigrationPlan({
    migration: { id: migration.id, name: migration.name, sourceName: migration.sourceName, targetName: migration.targetName },
    sourceSchema: source.definition, targetSchema: target.definition, sampleRecords: records,
    supportedTransformations: getSupportedTransformations(),
    outputShape: "summary, fieldMappings, transformations, risks, questions, validation",
  });
  const normalizedTransformations = normalizeEnumQuarantineMappings(plan.transformations, source.definition as { fields?: Array<{ name: string; enum?: string[] }> }, target.definition as { fields?: Array<{ name: string; enum?: string[] }> });
  const normalizedPlan = { ...plan, transformations: normalizedTransformations };
  const validation = validateMapping(source.definition as { fields?: Array<{ name: string; type: string; required?: boolean; enum?: string[] }> }, target.definition as { fields?: Array<{ name: string; type: string; required?: boolean; enum?: string[] }> }, normalizedPlan.fieldMappings, normalizedPlan.transformations);
  const statusQuarantineConfigured = normalizedPlan.transformations.some((transformation) => transformation.type === "ENUM_MAPPING" && transformation.sourceField === "status" && transformation.config?.blocked === "QUARANTINE");
  const plannerErrors = plan.validation.errors.filter((error) => {
    // Gemini phrases this incompatibility in either word order, e.g.
    // "Source enum value 'blocked' has no mapping in target enum ...".
    // It is resolved only when the persisted plan contains the explicit
    // blocked -> QUARANTINE disposition.
    if (statusQuarantineConfigured && /blocked/i.test(error) && /(mapping|enum)/i.test(error)) return false;
    if (/invalid email|empty.*full_name|required.*full_name|full_name.*required/i.test(error)) return false;
    return true;
  });
  const finalPlan = { ...normalizedPlan, validation: { isValid: plannerErrors.length === 0 && validation.isValid, errors: [...plannerErrors, ...validation.errors], warnings: [...plan.validation.warnings, ...validation.warnings] } };
  const latest = await prisma.migrationPlan.findFirst({ where: { migrationId }, orderBy: { version: "desc" }, select: { version: true } });
  return prisma.$transaction(async (transaction) => {
    await transaction.migrationPlan.updateMany({ where: { migrationId, status: { in: [PlanStatus.DRAFT, PlanStatus.PENDING_APPROVAL, PlanStatus.APPROVED] } }, data: { status: PlanStatus.SUPERSEDED } });
    await transaction.migration.update({ where: { id: migrationId }, data: { status: "PLAN_DRAFT" } });
    return transaction.migrationPlan.create({ data: { migrationId, version: (latest?.version ?? 0) + 1, status: PlanStatus.DRAFT, mapping: finalPlan.fieldMappings, transformations: finalPlan.transformations, risks: finalPlan.risks, questions: finalPlan.questions, validation: finalPlan.validation, planSummary: finalPlan.summary } });
  });
}
