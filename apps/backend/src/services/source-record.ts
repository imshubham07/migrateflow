export function getSourceRecordId(record: Record<string, unknown>, index: number): string {
  const candidate = record.customer_id ?? record.id ?? record.source_id ?? record.sourceId;
  return candidate === undefined || candidate === null || String(candidate) === "" ? `row-${index + 1}` : String(candidate);
}
