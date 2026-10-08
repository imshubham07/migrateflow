import { readFile } from "node:fs/promises";
import { PrismaClient, SchemaType } from "@prisma/client";
import { demoPath } from "../../utils/demo-data.js";

const prisma = new PrismaClient();
const supportedTransformations = [
  { type: "DIRECT", description: "Copy a value without modification.", input: "any", output: "same" },
  { type: "LOWERCASE", description: "Convert a string to lowercase.", input: "string", output: "string" },
  { type: "UPPERCASE", description: "Convert a string to uppercase.", input: "string", output: "string" },
  { type: "TRIM", description: "Remove surrounding whitespace.", input: "string", output: "string" },
  { type: "STRING_TO_INTEGER", description: "Parse a numeric string as an integer.", input: "string", output: "integer" },
  { type: "INTEGER_TO_STRING", description: "Convert an integer to a string.", input: "integer", output: "string" },
  { type: "DATE_NORMALIZE", description: "Normalize a supported date/datetime representation.", input: "date/datetime", output: "datetime" },
  { type: "BOOLEAN_NORMALIZE", description: "Normalize an explicitly supported boolean representation.", input: "boolean/string", output: "boolean" },
  { type: "ENUM_MAPPING", description: "Map explicitly listed enum values. A mapped value of QUARANTINE deliberately rejects the source record with field-level evidence.", input: "enum", output: "enum or QUARANTINE" },
] as const;

const readJson = async (file: string): Promise<unknown> => JSON.parse(await readFile(await demoPath(file), "utf8"));

export async function inspectSourceSchema(migrationId: string) {
  return prisma.migrationSchema.findFirstOrThrow({ where: { migrationId, type: SchemaType.SOURCE }, orderBy: { version: "desc" } });
}
export async function inspectTargetSchema(migrationId: string) {
  return prisma.migrationSchema.findFirstOrThrow({ where: { migrationId, type: SchemaType.TARGET }, orderBy: { version: "desc" } });
}
export async function inspectSampleRecords(migrationId: string, limit: number) {
  const migration = await prisma.migration.findUniqueOrThrow({ where: { id: migrationId }, select: { sampleLimit: true, sourceName: true, sourceRecords: true } });
  if (migration.sourceRecords) return (migration.sourceRecords as unknown[]).slice(0, Math.min(limit, migration.sampleLimit));
  if (migration.sourceName !== "legacy_customers") return [];
  const boundedLimit = Math.max(0, Math.min(Math.floor(limit), migration.sampleLimit));
  return (await readJson("source-records.json") as unknown[]).slice(0, boundedLimit);
}
export function getSupportedTransformations() { return supportedTransformations; }
