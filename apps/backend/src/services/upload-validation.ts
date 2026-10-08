import { Prisma } from "@prisma/client";

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_UPLOAD_RECORDS = 1000;

type Field = { name: string; type?: string; required?: boolean; nullable?: boolean; enum?: string[] };
export type SchemaDefinition = { dataset?: string; fields: Field[] };

export function parseSchema(value: unknown, label: string): SchemaDefinition {
  if (!value || typeof value !== "object" || !Array.isArray((value as { fields?: unknown }).fields)) throw new Error(`${label} must be an object with a fields array.`);
  const fields = (value as { fields: unknown[] }).fields;
  if (fields.length === 0 || fields.length > 100) throw new Error(`${label} fields must contain between 1 and 100 fields.`);
  const names = new Set<string>();
  for (const field of fields) {
    if (!field || typeof field !== "object" || typeof (field as { name?: unknown }).name !== "string" || !(field as { name: string }).name.trim()) throw new Error(`${label} contains a field without a valid name.`);
    const name = (field as { name: string }).name;
    if (names.has(name)) throw new Error(`${label} contains duplicate field '${name}'.`);
    names.add(name);
  }
  return value as SchemaDefinition;
}

export function parseRecords(value: unknown, schema: SchemaDefinition): Prisma.InputJsonArray {
  if (!Array.isArray(value)) throw new Error("Source records must be a JSON array.");
  if (value.length === 0 || value.length > MAX_UPLOAD_RECORDS) throw new Error(`Source records must contain between 1 and ${MAX_UPLOAD_RECORDS} records.`);
  const fieldNames = new Set(schema.fields.map((field) => field.name));
  for (const [index, record] of value.entries()) {
    if (!record || typeof record !== "object" || Array.isArray(record)) throw new Error(`Source record ${index + 1} must be a JSON object.`);
    for (const key of Object.keys(record)) if (!fieldNames.has(key)) throw new Error(`Source record ${index + 1} contains unknown field '${key}'.`);
  }
  return value as Prisma.InputJsonArray;
}

export function parseCsv(text: string): unknown[] {
  const rows: string[][] = [];
  let row: string[] = []; let cell = ""; let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') { if (quoted && text[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((character === "\n" || character === "\r") && !quoted) { if (character === "\r" && text[index + 1] === "\n") index++; row.push(cell); if (row.some((item) => item !== "")) rows.push(row); row = []; cell = ""; }
    else cell += character;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field.");
  row.push(cell); if (row.some((item) => item !== "")) rows.push(row);
  if (rows.length < 2) throw new Error("CSV must contain a header and at least one record.");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) throw new Error("CSV headers must be non-empty and unique.");
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
