export type Transformation = { sourceField: string; targetField: string; type: string; config?: Record<string, string> };
export type Mapping = { sourceField: string; targetField: string; strategy?: string; config?: Record<string, string> };
export type ValidationError = { field: string; code: string; message: string; value?: unknown };

export function applyTransformation(value: unknown, transformation: Transformation): { value?: unknown; error?: ValidationError } {
  const invalid = (message: string): { error: ValidationError } => ({ error: { field: transformation.targetField, code: "INVALID_TRANSFORMATION_INPUT", message, value } });
  switch (transformation.type) {
    case "DIRECT": return { value };
    case "LOWERCASE": return typeof value === "string" ? { value: value.toLowerCase() } : invalid("LOWERCASE requires a string.");
    case "UPPERCASE": return typeof value === "string" ? { value: value.toUpperCase() } : invalid("UPPERCASE requires a string.");
    case "TRIM": return typeof value === "string" ? { value: value.trim() } : invalid("TRIM requires a string.");
    case "STRING_TO_INTEGER": {
      if (typeof value !== "string" || !/^-?\d+$/.test(value.trim())) return invalid("STRING_TO_INTEGER requires an integer string.");
      return { value: Number(value) };
    }
    case "INTEGER_TO_STRING": return typeof value === "number" && Number.isInteger(value) ? { value: String(value) } : invalid("INTEGER_TO_STRING requires an integer.");
    case "DATE_NORMALIZE": {
      if (typeof value !== "string" && !(value instanceof Date)) return invalid("DATE_NORMALIZE requires an ISO date string.");
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? invalid("DATE_NORMALIZE received an invalid date.") : { value: date.toISOString() };
    }
    case "BOOLEAN_NORMALIZE":
      if (value === true || value === false) return { value };
      if (value === "true" || value === "1") return { value: true };
      if (value === "false" || value === "0") return { value: false };
      return invalid("BOOLEAN_NORMALIZE accepts only true, false, \"true\", \"false\", \"1\", or \"0\".");
    case "ENUM_MAPPING": {
      const mapped = transformation.config?.[String(value)];
      if (mapped === "QUARANTINE") return { error: { field: transformation.targetField, code: "QUARANTINED_ENUM_VALUE", message: `Source value '${String(value)}' is explicitly configured for quarantine.`, value } };
      return mapped === undefined ? { error: { field: transformation.targetField, code: "ENUM_VALUE_NOT_MAPPED", message: `No enum mapping exists for '${String(value)}'.`, value } } : { value: mapped };
    }
    default: return invalid(`Unsupported transformation: ${transformation.type}.`);
  }
}

type Field = { name: string; type: string; required?: boolean; nullable?: boolean; enum?: string[] };
export function transformAndValidateRecord(source: Record<string, unknown>, mappings: Mapping[], transformations: Transformation[], targetFields: Field[]) {
  const output: Record<string, unknown> = {};
  const errors: ValidationError[] = [];
  const transformationFor = (mapping: Mapping) => transformations.find((item) => item.sourceField === mapping.sourceField && item.targetField === mapping.targetField);
  for (const mapping of mappings) {
    const transformation = transformationFor(mapping) ?? { sourceField: mapping.sourceField, targetField: mapping.targetField, type: mapping.strategy ?? "DIRECT", config: mapping.config };
    const result = applyTransformation(source[mapping.sourceField], transformation);
    if (result.error) errors.push(result.error); else output[mapping.targetField] = result.value;
  }
  for (const field of targetFields) {
    const value = output[field.name];
    if (field.required && (value === undefined || value === null || (typeof value === "string" && value.trim() === ""))) errors.push({ field: field.name, code: "REQUIRED_FIELD_MISSING", message: `Required field '${field.name}' is missing or empty.`, value });
    if (value === null && field.required && !field.nullable) errors.push({ field: field.name, code: "NULL_NOT_ALLOWED", message: `Field '${field.name}' does not allow null.`, value });
    if (value === undefined || value === null) continue;
    const typeValid = field.type === "integer" ? typeof value === "number" && Number.isInteger(value) : field.type === "string" ? typeof value === "string" : field.type === "datetime" ? typeof value === "string" && !Number.isNaN(Date.parse(value)) : true;
    if (!typeValid) errors.push({ field: field.name, code: "INVALID_TYPE", message: `Field '${field.name}' does not match type '${field.type}'.`, value });
    if (field.enum && !field.enum.includes(String(value))) errors.push({ field: field.name, code: "INVALID_ENUM_VALUE", message: `Value '${String(value)}' is not supported for '${field.name}'.`, value });
    if (field.name === "email" && (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) errors.push({ field: "email", code: "INVALID_EMAIL", message: "Invalid email format", value });
  }
  return { output, errors };
}
