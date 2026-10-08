import { z } from "zod";

export const transformationTypeSchema = z.enum(["DIRECT", "LOWERCASE", "UPPERCASE", "TRIM", "STRING_TO_INTEGER", "INTEGER_TO_STRING", "DATE_NORMALIZE", "BOOLEAN_NORMALIZE", "ENUM_MAPPING"]);
export const migrationPlanSchema = z.object({
  summary: z.string(),
  fieldMappings: z.array(z.object({ sourceField: z.string(), targetField: z.string(), strategy: transformationTypeSchema, reason: z.string() })),
  transformations: z.array(z.object({ sourceField: z.string(), targetField: z.string(), type: transformationTypeSchema, config: z.record(z.string()), reason: z.string() })),
  risks: z.array(z.object({ severity: z.enum(["LOW", "MEDIUM", "HIGH"]), field: z.string(), message: z.string() })),
  questions: z.array(z.object({ question: z.string(), reason: z.string(), blocking: z.boolean() })),
  validation: z.object({ isValid: z.boolean(), errors: z.array(z.string()), warnings: z.array(z.string()) }),
});
export type MigrationPlanOutput = z.infer<typeof migrationPlanSchema>;
