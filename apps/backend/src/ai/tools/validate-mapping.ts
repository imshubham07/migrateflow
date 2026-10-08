import { getSupportedTransformations } from "./inspection.js";

type Field = { name: string; type?: string; required?: boolean; nullable?: boolean; enum?: string[] };
type SchemaDefinition = { fields?: Field[] };
type Mapping = { sourceField: string; targetField: string; strategy: string };
type Transformation = { sourceField: string; targetField: string; type: string; config?: Record<string, string> };

export function enumMappingErrors(source: SchemaDefinition, target: SchemaDefinition, transformations: Transformation[]): string[] {
  const sourceFields = new Map((source.fields ?? []).map((field) => [field.name, field]));
  const targetFields = new Map((target.fields ?? []).map((field) => [field.name, field]));
  const errors: string[] = [];
  for (const transformation of transformations.filter((item) => item.type === "ENUM_MAPPING")) {
    const sourceField = sourceFields.get(transformation.sourceField);
    const targetField = targetFields.get(transformation.targetField);
    for (const sourceValue of sourceField?.enum ?? []) {
      const mapped = transformation.config?.[sourceValue];
      if (mapped === undefined) errors.push(`Missing enum mapping for ${transformation.sourceField} value '${sourceValue}'.`);
      else if (mapped !== "QUARANTINE" && targetField?.enum && (!targetField.enum.includes(mapped) || !targetField.enum.includes(sourceValue.toUpperCase()))) errors.push(`Invalid enum mapping for ${transformation.targetField}: ${sourceValue} → ${mapped}. Unsupported source enum values must map to QUARANTINE.`);
    }
  }
  return errors;
}

export function validateMapping(source: SchemaDefinition, target: SchemaDefinition, mappings: Mapping[], transformations: Transformation[]) {
  const sourceFields = new Map((source.fields ?? []).map((field) => [field.name, field]));
  const targetFields = new Map((target.fields ?? []).map((field) => [field.name, field]));
  const errors: string[] = [];
  const warnings: string[] = [];
  const supported: Set<string> = new Set(getSupportedTransformations().map((item) => item.type));
  const mappedTargets = new Set<string>();
  for (const mapping of mappings) {
    const sourceField = sourceFields.get(mapping.sourceField);
    const targetField = targetFields.get(mapping.targetField);
    if (!sourceField) errors.push(`Source field does not exist: ${mapping.sourceField}`);
    if (!targetField) errors.push(`Target field does not exist: ${mapping.targetField}`);
    if (!sourceField || !targetField) continue;
    mappedTargets.add(targetField.name);
    if (mapping.strategy && !supported.has(mapping.strategy)) errors.push(`Unsupported transformation: ${mapping.strategy}`);
    if (mapping.strategy === "DIRECT" && sourceField.type !== targetField.type) errors.push(`Incompatible types for ${mapping.sourceField} → ${mapping.targetField}`);
  }
  for (const field of target.fields ?? []) if (field.required && !mappedTargets.has(field.name)) errors.push(`Required target field has no mapping: ${field.name}`);
  for (const transformation of transformations) {
    if (!supported.has(transformation.type)) errors.push(`Unsupported transformation: ${transformation.type}`);
    if (transformation.type === "ENUM_MAPPING") {
      const targetField = targetFields.get(transformation.targetField);
      errors.push(...enumMappingErrors(source, target, [transformation]));
      const values = Object.values(transformation.config ?? {});
      if (targetField?.enum && values.some((value) => value !== "QUARANTINE" && !targetField.enum?.includes(value))) errors.push(`Invalid enum mapping for ${transformation.targetField}`);
      if (transformation.config?.blocked === "QUARANTINE" && transformation.targetField !== "status") warnings.push(`The blocked source value will be quarantined for ${transformation.targetField}.`);
    }
  }
  return { isValid: errors.length === 0, errors, warnings };
}
